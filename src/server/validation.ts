import { z } from "zod";
import { assetStatuses, assetTypes, currencies, roles } from "./db/schema";

// Messages are translation keys under "validation.*".
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "username");
export const password = z.string().min(10, "passwordMin").max(200, "passwordMax");
export const personName = z.string().trim().min(1, "required").max(80, "tooLong");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const firstAdminInput = z.object({ username, name: personName, password });

export const newUserInput = z.object({
  username,
  name: personName,
  password,
  role: z.enum(roles),
  companyIds: z.array(z.number().int().positive()).default([]),
});

export const userUpdateInput = z.object({
  name: personName,
  role: z.enum(roles),
  active: z.boolean(),
  companyIds: z.array(z.number().int().positive()).default([]),
});

export const companyInput = z.object({
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  contact: optionalText(120),
  phone: optionalText(40),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "date")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/** "00:1a:2b:3c:4d:5e", "00-1A-2B-3C-4D-5E", "001A.2B3C.4D5E" or "001A2B3C4D5E" → "00:1A:2B:3C:4D:5E"; anything else → null. */
export function normalizeMac(text: string): string | null {
  const hex = text.trim().replace(/[\s:.-]/g, "");
  return /^[0-9A-Fa-f]{12}$/.test(hex) ? hex.toUpperCase().match(/../g)!.join(":") : null;
}

const optionalIp = z
  .string()
  .trim()
  .refine((v) => v === "" || z.ipv4().safeParse(v).success || z.ipv6().safeParse(v).success, "ip")
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullable()
  .optional();

const optionalMac = z
  .string()
  .transform((v, ctx) => {
    if (v.trim() === "") return null;
    const mac = normalizeMac(v);
    if (!mac) {
      ctx.addIssue({ code: "custom", message: "mac" });
      return z.NEVER;
    }
    return mac;
  })
  .nullable()
  .optional();

/** RAM in GB: accepts 16, "16" and "16 GB"; empty means unknown. */
const optionalRam = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    const text = v.trim().replace(/\s*gb$/i, "");
    return text === "" ? null : /^\d+$/.test(text) ? Number(text) : v;
  },
  z.number("ram").int("ram").min(1, "ram").max(8192, "ram").nullable(),
);

export const assetInput = z.object({
  /** Empty means "generate the next free tag". */
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{0,32}$/, "tag")
    // Stored in capitals, so "d-0054" and "D-0054" are the same tag (QA O4).
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .nullable()
    .optional(),
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  type: z.enum(assetTypes),
  status: z.enum(assetStatuses),
  brand: optionalText(120),
  model: optionalText(120),
  serial: optionalText(120),
  locationId: z.number().int().positive().nullable().optional(),
  assignedTo: optionalText(120),
  purchaseDate: optionalDate,
  warrantyEnd: optionalDate,
  notes: optionalText(2000),
  cpu: optionalText(120),
  ramGb: optionalRam.optional(),
  storage: optionalText(120),
  os: optionalText(120),
  hostname: optionalText(120),
  ipAddress: optionalIp,
  macAddress: optionalMac,
}).refine((v) => !(v.purchaseDate && v.warrantyEnd && v.warrantyEnd < v.purchaseDate), {
  // QA O5: a warranty cannot end before the device was bought.
  path: ["warrantyEnd"],
  message: "warrantyBeforePurchase",
  // Checked even when other fields have problems, so the form shows them all at once (QA O7).
  when: ({ value }) => {
    const dates = value as { purchaseDate?: unknown; warrantyEnd?: unknown };
    return typeof dates?.purchaseDate === "string" && typeof dates?.warrantyEnd === "string";
  },
});

export const locationInput = z.object({ name: z.string().trim().min(1, "required").max(80, "tooLong") });

/** "1250", "1250,5", "1.250,50" or "1250.50" → minor units (125050). Empty → null. */
const optionalMoney = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const normalised = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalised)) {
      ctx.addIssue({ code: "custom", message: "money" });
      return z.NEVER;
    }
    return Math.round(Number(normalised) * 100);
  })
  .nullable()
  .optional();

const optionalSeats = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < 1 || n > 100_000) {
      ctx.addIssue({ code: "custom", message: "seats" });
      return z.NEVER;
    }
    return n;
  })
  .nullable()
  .optional();

export const licenseInput = z.object({
  name: z.string().trim().min(1, "required").max(120, "tooLong"),
  vendor: optionalText(120),
  seats: optionalSeats,
  /** Empty or missing keeps the stored key; use clearKey to remove it. */
  key: z.string().trim().max(2000, "tooLong").optional(),
  clearKey: z.boolean().optional(),
  expiryDate: optionalDate,
  cost: optionalMoney,
  currency: z.enum(currencies).default("TRY"),
  notes: optionalText(2000),
});

export type LicenseInput = z.infer<typeof licenseInput>;
export type AssetInput = z.infer<typeof assetInput>;
export type LocationInput = z.infer<typeof locationInput>;
export type FirstAdminInput = z.infer<typeof firstAdminInput>;
export type NewUserInput = z.infer<typeof newUserInput>;
export type UserUpdateInput = z.infer<typeof userUpdateInput>;
export type CompanyInput = z.infer<typeof companyInput>;

const emailAddress = z.string().trim().email("email").max(200, "tooLong");

export const notificationSettingsInput = z
  .object({
    emailEnabled: z.boolean(),
    smtpHost: z.string().trim().max(200, "tooLong"),
    smtpPort: z.coerce.number("port").int("port").min(1, "port").max(65535, "port"),
    /** true: TLS from the start (port 465). false: STARTTLS when the server offers it. */
    smtpSecure: z.boolean(),
    smtpUser: z.string().trim().max(200, "tooLong"),
    /** Empty keeps the stored password. */
    smtpPassword: z.string().max(500, "tooLong").optional(),
    smtpFrom: z.string().trim().max(200, "tooLong"),
    /** Comma, semicolon or whitespace separated. */
    emailTo: z
      .string()
      .transform((v) => v.split(/[\s,;]+/).filter(Boolean))
      .pipe(z.array(emailAddress).max(20, "tooMany")),
    telegramEnabled: z.boolean(),
    /** Empty keeps the stored token. */
    telegramToken: z.string().trim().max(200, "tooLong").optional(),
    telegramChatId: z.string().trim().max(64, "tooLong"),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message = "required") => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (v.emailEnabled) {
      need(v.smtpHost !== "", "smtpHost");
      need(emailAddress.safeParse(v.smtpFrom).success, "smtpFrom", "email");
      need(v.emailTo.length > 0, "emailTo");
    }
    if (v.telegramEnabled) need(/^(-?\d+|@\w+)$/.test(v.telegramChatId), "telegramChatId", "chatId");
  });

export type NotificationSettingsInput = z.infer<typeof notificationSettingsInput>;
