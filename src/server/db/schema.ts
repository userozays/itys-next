import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  contact: text("contact"),
  phone: text("phone"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** The highest D-NNNN device tag ever issued here. Only goes up, so a deleted
   *  device's number is never reused and an old printed label cannot point at a new device. */
  tagSeq: integer("tag_seq").notNull().default(0),
  createdAt: createdAt(),
});

export const roles = ["admin", "technician"] as const;
export type Role = (typeof roles)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: roles }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

/** Which companies a technician may access. Admins access every company. */
export const userCompanies = sqliteTable(
  "user_companies",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

/** Server-side sessions. Only a SHA-256 hash of the cookie token is stored. */
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(), // epoch seconds
  lastSeenAt: integer("last_seen_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/** Failed sign-in attempts, keyed by "u:<username>" and "ip:<address>". */
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    at: integer("at").notNull(), // epoch seconds
  },
  (t) => [index("login_attempts_key_at").on(t.key, t.at)],
);

/** A place inside a company (branch, floor, room). */
export const locations = sqliteTable(
  "locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("locations_company_name").on(t.companyId, t.name)],
);

export const assetTypes = ["computer", "laptop", "server", "printer", "network", "monitor", "phone", "other"] as const;
export type AssetType = (typeof assetTypes)[number];

export const assetStatuses = ["in_use", "in_stock", "in_repair", "retired"] as const;
export type AssetStatus = (typeof assetStatuses)[number];

/** How a record entered the system; "agent" is reserved for a later version. */
export const assetSources = ["manual", "import", "agent"] as const;

export const assets = sqliteTable(
  "assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Printed on the label / QR code; unique within a company. */
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: assetTypes }).notNull(),
    status: text("status", { enum: assetStatuses }).notNull().default("in_use"),
    brand: text("brand"),
    model: text("model"),
    serial: text("serial"),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
    assignedTo: text("assigned_to"),
    purchaseDate: text("purchase_date"), // YYYY-MM-DD
    warrantyEnd: text("warranty_end"), // YYYY-MM-DD
    notes: text("notes"),
    // Technical specifications; all optional, and what an agent would report later.
    cpu: text("cpu"),
    ramGb: integer("ram_gb"),
    storage: text("storage"),
    os: text("os"),
    hostname: text("hostname"),
    ipAddress: text("ip_address"),
    macAddress: text("mac_address"),
    source: text("source", { enum: assetSources }).notNull().default("manual"),
    /** Stable identifier reported by an agent or an import file. */
    externalId: text("external_id"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("assets_company_tag").on(t.companyId, t.tag),
    index("assets_company_name").on(t.companyId, t.name),
    // For the duplicate checks in assetConflicts(), which compare in capitals.
    index("assets_company_tag_upper").on(t.companyId, sql`upper(${t.tag})`),
    index("assets_company_serial_upper").on(t.companyId, sql`upper(${t.serial})`),
    index("assets_company_mac_upper").on(t.companyId, sql`upper(${t.macAddress})`),
    index("assets_company_ip").on(t.companyId, t.ipAddress),
  ],
);

export const currencies = ["TRY", "USD", "EUR"] as const;
export type Currency = (typeof currencies)[number];

/** Subscription: paid every period. Perpetual: bought once (an expiry date then means end of support). */
export const licenseKinds = ["subscription", "perpetual"] as const;
export type LicenseKind = (typeof licenseKinds)[number];
export const billingPeriods = ["monthly", "yearly"] as const;
export type BillingPeriod = (typeof billingPeriods)[number];

export const licenses = sqliteTable(
  "licenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vendor: text("vendor"),
    /** How many devices may use it; null means unlimited. */
    seats: integer("seats"),
    /** Product key, encrypted with src/server/crypto/secrets.ts. Never sent to the browser unasked. */
    keyEncrypted: text("key_encrypted"),
    expiryDate: text("expiry_date"), // YYYY-MM-DD; null means it does not end
    kind: text("kind", { enum: licenseKinds }).notNull().default("subscription"),
    /** Only for subscriptions; the cost is per period. */
    billingPeriod: text("billing_period", { enum: billingPeriods }),
    purchaseDate: text("purchase_date"), // YYYY-MM-DD
    /** Price in minor units (kuruş, cent): per billing period for a subscription, once for a perpetual license. */
    costMinor: integer("cost_minor"),
    currency: text("currency", { enum: currencies }).notNull().default("TRY"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("licenses_company_name").on(t.companyId, t.name)],
);

/** Which device uses which license; one seat per row. */
export const licenseAssignments = sqliteTable(
  "license_assignments",
  {
    licenseId: integer("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.licenseId, t.assetId] }), index("license_assignments_asset").on(t.assetId)],
);

/** An uploaded spreadsheet waiting to be mapped and imported, then its result. */
export const importJobs = sqliteTable("import_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  headers: text("headers", { mode: "json" }).$type<string[]>().notNull(),
  /** Raw cell text; emptied once the import has run. */
  rows: text("rows", { mode: "json" }).$type<string[][]>().notNull(),
  /** Field name → column index. */
  mapping: text("mapping", { mode: "json" }).$type<Record<string, number>>().notNull(),
  status: text("status", { enum: ["pending", "done"] })
    .notNull()
    .default("pending"),
  importedCount: integer("imported_count").notNull().default(0),
  /** Rows that were skipped, with the reasons, kept for the result page. */
  report: text("report", { mode: "json" }).$type<{ row: number; issues: { field: string; code: string }[] }[]>(),
  createdAt: createdAt(),
});

/** Application-wide settings, one JSON document per key. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
});

export const expiryKinds = ["warranty", "license"] as const;
export type ExpiryKind = (typeof expiryKinds)[number];

/** Remembers which expiry warnings were already raised, so each fires once.
 *  The due date is part of the key: renewing a license re-arms its warnings. */
export const expiryNotices = sqliteTable(
  "expiry_notices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: expiryKinds }).notNull(),
    refId: integer("ref_id").notNull(),
    threshold: integer("threshold").notNull(), // days before the due date: 30, 7 or 0
    dueDate: text("due_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expiry_notices_once").on(t.kind, t.refId, t.threshold, t.dueDate)],
);

export const notificationChannels = ["email", "telegram"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

/** Outbox: messages are written here first, then delivered with retries. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channel: text("channel", { enum: notificationChannels }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: integer("next_attempt_at").notNull(), // epoch seconds
    createdAt: integer("created_at").notNull(),
    sentAt: integer("sent_at"),
  },
  (t) => [index("notifications_status_next").on(t.status, t.nextAttemptAt)],
);

export type Company = typeof companies.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type User = typeof users.$inferSelect;
