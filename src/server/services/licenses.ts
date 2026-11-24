import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { addDaysIso, SOON_DAYS, todayIso, type ExpiryFilter } from "../../lib/dates";
import type { Actor } from "../auth/sessions";
import { decryptSecret, encryptSecret } from "../crypto/secrets";
import type { Db, DbOrTx } from "../db/client";
import { assets, licenseAssignments, licenses, type BillingPeriod, type Currency, type LicenseKind } from "../db/schema";
import { AppError } from "../errors";
import { licenseBillingPeriod, type LicenseInput } from "../validation";
import { searchFold } from "../../lib/turkish";
import { trFold, trKey } from "../db/turkish-sql";
import { getAsset } from "./assets";
import { getCompany } from "./companies";

/** A license as shown to users: the key itself is never part of it. */
export type LicenseView = {
  id: number;
  companyId: number;
  name: string;
  vendor: string | null;
  seats: number | null;
  usedSeats: number;
  hasKey: boolean;
  expiryDate: string | null;
  kind: LicenseKind;
  billingPeriod: BillingPeriod | null;
  purchaseDate: string | null;
  costMinor: number | null;
  currency: Currency;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssignedAsset = { id: number; tag: string; name: string };

const viewColumns = {
  id: licenses.id,
  companyId: licenses.companyId,
  name: licenses.name,
  vendor: licenses.vendor,
  seats: licenses.seats,
  // Table names are spelled out: Drizzle writes bare column names inside a raw
  // sub-select, and a bare "id" would be resolved against the wrong table.
  usedSeats: sql<number>`(select count(*) from license_assignments la where la.license_id = "licenses"."id")`,
  hasKey: sql<number>`${licenses.keyEncrypted} is not null`.mapWith(Boolean),
  expiryDate: licenses.expiryDate,
  kind: licenses.kind,
  billingPeriod: licenses.billingPeriod,
  purchaseDate: licenses.purchaseDate,
  costMinor: licenses.costMinor,
  currency: licenses.currency,
  notes: licenses.notes,
  createdAt: licenses.createdAt,
  updatedAt: licenses.updatedAt,
};

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listLicenses(
  db: Db,
  actor: Actor,
  companyId: number,
  q?: string,
  expiry?: ExpiryFilter,
  today: string = todayIso(),
): LicenseView[] {
  getCompany(db, actor, companyId);
  const term = q?.trim();
  const pattern = term ? `%${escapeLike(searchFold(term))}%` : null;
  return db
    .select(viewColumns)
    .from(licenses)
    .where(
      and(
        eq(licenses.companyId, companyId),
        pattern
          ? sql`(${trFold(licenses.name)} like ${pattern} escape '\\' or ${trFold(licenses.vendor)} like ${pattern} escape '\\')`
          : undefined,
        expiry === "soon"
          ? and(gte(licenses.expiryDate, today), lte(licenses.expiryDate, addDaysIso(today, SOON_DAYS)))
          : expiry === "expired"
            ? lt(licenses.expiryDate, today)
            : undefined,
      ),
    )
    .orderBy(trKey(licenses.name), asc(licenses.id))
    .all();
}

/** Loads a license only if the actor may access its company. */
export function getLicense(db: DbOrTx, actor: Actor, licenseId: number): LicenseView {
  const row = db.select(viewColumns).from(licenses).where(eq(licenses.id, licenseId)).get();
  if (!row) throw new AppError("notFound");
  getCompany(db, actor, row.companyId);
  return row;
}

function fields(input: LicenseInput) {
  return {
    name: input.name,
    vendor: input.vendor ?? null,
    seats: input.seats ?? null,
    expiryDate: input.expiryDate ?? null,
    kind: input.kind ?? "subscription",
    billingPeriod: licenseBillingPeriod(input.kind ?? "subscription", input.billingPeriod),
    purchaseDate: input.purchaseDate ?? null,
    costMinor: input.cost ?? null,
    currency: input.currency,
    notes: input.notes ?? null,
  };
}

export function createLicense(db: Db, actor: Actor, companyId: number, input: LicenseInput): LicenseView {
  getCompany(db, actor, companyId);
  const { id } = db
    .insert(licenses)
    .values({ ...fields(input), companyId, keyEncrypted: input.key ? encryptSecret(input.key) : null })
    .returning({ id: licenses.id })
    .get();
  return getLicense(db, actor, id);
}

export function updateLicense(db: Db, actor: Actor, licenseId: number, input: LicenseInput): LicenseView {
  const current = getLicense(db, actor, licenseId);
  if (input.seats != null && input.seats < current.usedSeats) throw new AppError("seatsBelowUsage");
  // An empty key field means "leave the stored key alone".
  const keyChange = input.clearKey ? { keyEncrypted: null } : input.key ? { keyEncrypted: encryptSecret(input.key) } : {};
  db.update(licenses)
    .set({ ...fields(input), ...keyChange, updatedAt: sql`(datetime('now'))` })
    .where(eq(licenses.id, current.id))
    .run();
  return getLicense(db, actor, licenseId);
}

/** Admin only. Assignments go with it. */
export function deleteLicense(db: Db, actor: Actor, licenseId: number): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
  const current = getLicense(db, actor, licenseId);
  db.delete(licenses).where(eq(licenses.id, current.id)).run();
}

/** Decrypts the product key for someone who may access the license's company. */
export function revealLicenseKey(db: Db, actor: Actor, licenseId: number): string | null {
  const current = getLicense(db, actor, licenseId);
  const row = db.select({ key: licenses.keyEncrypted }).from(licenses).where(eq(licenses.id, current.id)).get();
  return row?.key ? decryptSecret(row.key) : null;
}

export function listAssignedAssets(db: Db, actor: Actor, licenseId: number): AssignedAsset[] {
  const current = getLicense(db, actor, licenseId);
  return db
    .select({ id: assets.id, tag: assets.tag, name: assets.name })
    .from(licenseAssignments)
    .innerJoin(assets, eq(assets.id, licenseAssignments.assetId))
    .where(eq(licenseAssignments.licenseId, current.id))
    .orderBy(trKey(assets.name), asc(assets.id))
    .all();
}

/** Licenses in use on one device. */
export function listLicensesForAsset(db: Db, actor: Actor, assetId: number): LicenseView[] {
  const asset = getAsset(db, actor, assetId);
  return db
    .select(viewColumns)
    .from(licenseAssignments)
    .innerJoin(licenses, eq(licenses.id, licenseAssignments.licenseId))
    .where(eq(licenseAssignments.assetId, asset.id))
    .orderBy(trKey(licenses.name), asc(licenses.id))
    .all();
}

/** Puts a license on a device of the same company, if a seat is free. */
export function assignLicense(db: Db, actor: Actor, licenseId: number, assetId: number): void {
  db.transaction((tx) => {
    const license = getLicense(tx, actor, licenseId);
    if (!assetId) throw new AppError("chooseAsset");
    const asset = tx
      .select({ id: assets.id, companyId: assets.companyId, status: assets.status })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();
    if (!asset || asset.companyId !== license.companyId) throw new AppError("invalidAsset");
    if (asset.status === "retired") throw new AppError("retiredAsset");

    const existing = tx
      .select({ assetId: licenseAssignments.assetId })
      .from(licenseAssignments)
      .where(and(eq(licenseAssignments.licenseId, license.id), eq(licenseAssignments.assetId, asset.id)))
      .get();
    if (existing) throw new AppError("alreadyAssigned");
    if (license.seats != null && license.usedSeats >= license.seats) throw new AppError("noSeats");

    tx.insert(licenseAssignments).values({ licenseId: license.id, assetId: asset.id }).run();
  });
}

export function unassignLicense(db: Db, actor: Actor, licenseId: number, assetId: number): void {
  const license = getLicense(db, actor, licenseId);
  db.delete(licenseAssignments)
    .where(and(eq(licenseAssignments.licenseId, license.id), eq(licenseAssignments.assetId, assetId)))
    .run();
}

/** Amounts per currency, in minor units. Currencies are never added together. */
export type MoneyByCurrency = Partial<Record<Currency, number>>;

export type LicenseSummary = {
  count: number;
  /** Seats used and available, over licenses with a seat limit. */
  seatsUsed: number;
  seatsTotal: number;
  /** Licenses with no free seat left. */
  fullCount: number;
  /** Ending within SOON_DAYS (not yet ended). */
  endingSoon: number;
  /** What subscriptions cost per year: monthly × 12 plus yearly. */
  yearlySubscriptions: MoneyByCurrency;
  /** One-off prices of perpetual licenses. */
  perpetualPurchases: MoneyByCurrency;
};

/** License figures for the dashboard (QA Ö6). */
export function licenseSummary(db: Db, actor: Actor, companyId: number, today = todayIso()): LicenseSummary {
  const rows = listLicenses(db, actor, companyId);
  const soonLimit = addDaysIso(today, SOON_DAYS);
  const add = (into: MoneyByCurrency, currency: Currency, minor: number) => {
    into[currency] = (into[currency] ?? 0) + minor;
  };
  const summary: LicenseSummary = {
    count: rows.length,
    seatsUsed: 0,
    seatsTotal: 0,
    fullCount: 0,
    endingSoon: 0,
    yearlySubscriptions: {},
    perpetualPurchases: {},
  };
  for (const l of rows) {
    if (l.seats != null) {
      summary.seatsUsed += Math.min(l.usedSeats, l.seats);
      summary.seatsTotal += l.seats;
      if (l.usedSeats >= l.seats) summary.fullCount += 1;
    }
    if (l.expiryDate && l.expiryDate >= today && l.expiryDate <= soonLimit) summary.endingSoon += 1;
    if (l.costMinor == null) continue;
    if (l.kind === "perpetual") add(summary.perpetualPurchases, l.currency, l.costMinor);
    else add(summary.yearlySubscriptions, l.currency, l.billingPeriod === "monthly" ? l.costMinor * 12 : l.costMinor);
  }
  return summary;
}
