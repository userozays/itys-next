import { and, asc, desc, eq, gte, inArray, isNotNull, like, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { addDaysIso, SOON_DAYS, todayIso, type ExpiryFilter } from "../../lib/dates";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, companies, locations, type Asset, type AssetStatus, type AssetType } from "../db/schema";
import { AppError, FieldErrors, type FieldIssue } from "../errors";
import { normalizeMac, type AssetInput } from "../validation";
import { searchFold } from "../../lib/turkish";
import { fold } from "../import/mapping";
import { trFold, trKey } from "../db/turkish-sql";
import { getCompany, listCompanies } from "./companies";

export const PAGE_SIZE = 25;

export const assetSortKeys = ["tag", "name", "type", "status", "warrantyEnd", "updatedAt"] as const;
export type AssetSortKey = (typeof assetSortKeys)[number];

export type AssetFilter = {
  q?: string;
  type?: AssetType;
  status?: AssetStatus;
  locationId?: number;
  sort?: AssetSortKey;
  dir?: "asc" | "desc";
  page?: number;
  /** Devices whose warranty ends soon or has ended; retired devices are left out. */
  warranty?: ExpiryFilter;
  /** For tests; defaults to the real date. */
  today?: string;
};

export type AssetListItem = Asset & { locationName: string | null };
export type AssetSummary = { total: number; byType: Record<string, number>; byStatus: Record<string, number> };

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE/.test(e.message);
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

// Text columns sort by a Turkish key (src/lib/turkish.ts); SQLite alone would put Ç, İ, Ö, Ş, Ü after Z.
const sortColumns = {
  tag: trKey(assets.tag),
  name: trKey(assets.name),
  type: assets.type,
  status: assets.status,
  warrantyEnd: assets.warrantyEnd,
  updatedAt: assets.updatedAt,
} as const;

const listColumns = {
  id: assets.id,
  companyId: assets.companyId,
  tag: assets.tag,
  name: assets.name,
  type: assets.type,
  status: assets.status,
  brand: assets.brand,
  model: assets.model,
  serial: assets.serial,
  locationId: assets.locationId,
  assignedTo: assets.assignedTo,
  purchaseDate: assets.purchaseDate,
  warrantyEnd: assets.warrantyEnd,
  notes: assets.notes,
  cpu: assets.cpu,
  ramGb: assets.ramGb,
  storage: assets.storage,
  os: assets.os,
  hostname: assets.hostname,
  ipAddress: assets.ipAddress,
  macAddress: assets.macAddress,
  source: assets.source,
  externalId: assets.externalId,
  createdAt: assets.createdAt,
  updatedAt: assets.updatedAt,
  locationName: locations.name,
};

function filterWhere(companyId: number, filter: AssetFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [eq(assets.companyId, companyId)];
  const q = filter.q?.trim();
  if (q) {
    // Both sides are folded, so "AYŞE", "ayse" and "Ayşe" all match.
    const pattern = `%${escapeLike(searchFold(q))}%`;
    const match = (column: AnySQLiteColumn) => sql`${trFold(column)} like ${pattern} escape '\\'`;
    conditions.push(
      or(match(assets.tag), match(assets.name), match(assets.brand), match(assets.model), match(assets.serial), match(assets.assignedTo), match(assets.hostname), match(assets.ipAddress)),
    );
  }
  if (filter.type) conditions.push(eq(assets.type, filter.type));
  if (filter.status) conditions.push(eq(assets.status, filter.status));
  if (filter.locationId) conditions.push(eq(assets.locationId, filter.locationId));
  if (filter.warranty) {
    const today = filter.today ?? todayIso();
    conditions.push(ne(assets.status, "retired"));
    conditions.push(
      filter.warranty === "soon"
        ? and(gte(assets.warrantyEnd, today), lte(assets.warrantyEnd, addDaysIso(today, SOON_DAYS)))
        : lt(assets.warrantyEnd, today),
    );
  }
  return and(...conditions);
}

/** A page of the company's assets, plus the total number matching the filter. */
export function listAssets(
  db: Db,
  actor: Actor,
  companyId: number,
  filter: AssetFilter = {},
): { rows: AssetListItem[]; total: number; page: number; pageCount: number } {
  getCompany(db, actor, companyId);

  const where = filterWhere(companyId, filter);

  const total = db.select({ n: sql<number>`count(*)` }).from(assets).where(where).get()?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filter.page ?? 1) || 1), pageCount);
  const column = sortColumns[filter.sort ?? "name"];
  const order = filter.dir === "desc" ? desc(column) : asc(column);

  const rows = db
    .select(listColumns)
    .from(assets)
    .leftJoin(locations, eq(locations.id, assets.locationId))
    .where(where)
    .orderBy(order, asc(assets.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all();

  return { rows, total, page, pageCount };
}

/** Loads an asset only if the actor may access its company. */
export function getAsset(db: Db, actor: Actor, assetId: number): AssetListItem {
  const row = db
    .select(listColumns)
    .from(assets)
    .leftJoin(locations, eq(locations.id, assets.locationId))
    .where(eq(assets.id, assetId))
    .get();
  if (!row) throw new AppError("notFound");
  getCompany(db, actor, row.companyId);
  return row;
}

const AUTO_TAG = /^D-(\d+)$/;
const autoTagNumber = (tag: string) => Number(AUTO_TAG.exec(tag)?.[1] ?? 0);

/**
 * Hands out device tags of the form D-0001 within a company. Numbering
 * continues after the highest number ever issued (remembered on the company)
 * or currently in use, whichever is greater, so numbers are never reused.
 * `reserved` are tags about to be inserted in the same operation (an import).
 */
export function tagAllocator(db: DbOrTx, companyId: number, reserved: string[] = []): () => string {
  const issued = db.select({ seq: companies.tagSeq }).from(companies).where(eq(companies.id, companyId)).get()?.seq ?? 0;
  const inUse = db
    .select({ tag: assets.tag })
    .from(assets)
    .where(and(eq(assets.companyId, companyId), like(assets.tag, "D-%")))
    .all()
    .map((r) => r.tag);
  let n = Math.max(issued, ...[...inUse, ...reserved].map(autoTagNumber));
  return () => {
    n++;
    db.update(companies).set({ tagSeq: n }).where(eq(companies.id, companyId)).run();
    return `D-${String(n).padStart(4, "0")}`;
  };
}

function assertLocationInCompany(db: DbOrTx, companyId: number, locationId: number | null | undefined): void {
  if (!locationId) return;
  const row = db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.companyId, companyId)))
    .get();
  if (!row) throw new AppError("invalidLocation");
}

function values(input: AssetInput) {
  return {
    name: input.name,
    type: input.type,
    status: input.status,
    brand: input.brand ?? null,
    model: input.model ?? null,
    serial: input.serial ?? null,
    locationId: input.locationId ?? null,
    assignedTo: input.assignedTo ?? null,
    purchaseDate: input.purchaseDate ?? null,
    warrantyEnd: input.warrantyEnd ?? null,
    notes: input.notes ?? null,
    cpu: input.cpu ?? null,
    ramGb: input.ramGb ?? null,
    storage: input.storage ?? null,
    os: input.os ?? null,
    hostname: input.hostname ?? null,
    ipAddress: input.ipAddress ?? null,
    macAddress: input.macAddress ?? null,
  };
}

/** A serial shorter than this (letters and digits only) is treated as "none": "-", "N/A", "yok". */
const MIN_SERIAL_CHARS = 4;
export const meaningfulSerial = (serial: string) => serial.replace(/[^\p{L}\p{N}]/gu, "").length >= MIN_SERIAL_CHARS;

/**
 * What would clash with another device of the same company: the tag (always
 * unique), the serial number and the MAC address (QA O4, O6). Comparison
 * ignores case. Takes the values as typed, so it can run before or after
 * validation; values that are not valid are skipped here.
 */
export function assetConflicts(
  db: DbOrTx,
  companyId: number,
  values: { tag?: string | null; serial?: string | null; macAddress?: string | null },
  excludeAssetId?: number,
): FieldIssue[] {
  const others = (column: AnySQLiteColumn, value: string) =>
    db
      .select({ id: assets.id, tag: assets.tag, name: assets.name })
      .from(assets)
      .where(
        and(
          eq(assets.companyId, companyId),
          sql`upper(${column}) = upper(${value})`,
          excludeAssetId ? ne(assets.id, excludeAssetId) : undefined,
        ),
      )
      .get();

  const issues: FieldIssue[] = [];
  const tag = values.tag?.trim();
  if (tag && /^[A-Za-z0-9._-]{1,32}$/.test(tag)) {
    const other = others(assets.tag, tag);
    if (other) issues.push({ field: "tag", key: "errors.tagUsedBy", params: { name: other.name } });
  }
  const serial = values.serial?.trim();
  if (serial && meaningfulSerial(serial)) {
    const other = others(assets.serial, serial);
    if (other) issues.push({ field: "serial", key: "errors.serialUsedBy", params: { tag: other.tag, name: other.name } });
  }
  const mac = values.macAddress ? normalizeMac(values.macAddress) : null;
  if (mac) {
    const other = others(assets.macAddress, mac);
    if (other) issues.push({ field: "macAddress", key: "errors.macUsedBy", params: { tag: other.tag, name: other.name } });
  }
  return issues;
}

/** Other devices of the same company with this device's IP address; shown as a warning, not an error (QA O6). */
export function devicesSharingIp(db: Db, actor: Actor, assetId: number): { id: number; tag: string; name: string }[] {
  const asset = getAsset(db, actor, assetId);
  if (!asset.ipAddress) return [];
  return db
    .select({ id: assets.id, tag: assets.tag, name: assets.name })
    .from(assets)
    .where(and(eq(assets.companyId, asset.companyId), eq(assets.ipAddress, asset.ipAddress), ne(assets.id, asset.id)))
    .orderBy(trKey(assets.tag))
    .all();
}

export function createAsset(
  db: DbOrTx,
  actor: Actor,
  companyId: number,
  input: AssetInput,
  source: "manual" | "import" = "manual",
): Asset {
  getCompany(db, actor, companyId);
  assertLocationInCompany(db, companyId, input.locationId);
  const conflicts = assetConflicts(db, companyId, input);
  if (conflicts.length > 0) throw new FieldErrors(conflicts);
  try {
    return db
      .insert(assets)
      .values({ ...values(input), companyId, source, tag: input.tag?.toUpperCase() ?? tagAllocator(db, companyId)() })
      .returning()
      .get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("tagTaken");
    throw e;
  }
}

/** The company of an asset never changes; it is taken from the stored record. */
export function updateAsset(db: Db, actor: Actor, assetId: number, input: AssetInput): Asset {
  const current = getAsset(db, actor, assetId);
  assertLocationInCompany(db, current.companyId, input.locationId);
  const conflicts = assetConflicts(db, current.companyId, input, current.id);
  if (conflicts.length > 0) throw new FieldErrors(conflicts);
  try {
    return db
      .update(assets)
      .set({ ...values(input), tag: input.tag?.toUpperCase() ?? current.tag, updatedAt: sql`(datetime('now'))` })
      .where(eq(assets.id, current.id))
      .returning()
      .get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("tagTaken");
    throw e;
  }
}

/** Admin only; technicians mark a device as retired instead. */
export function deleteAsset(db: Db, actor: Actor, assetId: number): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
  const current = getAsset(db, actor, assetId);
  db.delete(assets).where(eq(assets.id, current.id)).run();
}

export function assetSummary(db: Db, actor: Actor, companyId: number): AssetSummary {
  getCompany(db, actor, companyId);
  const count = (column: typeof assets.type | typeof assets.status) =>
    Object.fromEntries(
      db
        .select({ key: column, n: sql<number>`count(*)` })
        .from(assets)
        .where(eq(assets.companyId, companyId))
        .groupBy(column)
        .all()
        .map((r) => [r.key, r.n]),
    );
  const byType = count(assets.type);
  return { total: Object.values(byType).reduce((a, b) => a + b, 0), byType, byStatus: count(assets.status) };
}

/** Every device of a company, for pickers (id, tag and name only). */
export function listAssetOptions(db: Db, actor: Actor, companyId: number): { id: number; tag: string; name: string }[] {
  getCompany(db, actor, companyId);
  return db
    .select({ id: assets.id, tag: assets.tag, name: assets.name })
    .from(assets)
    .where(eq(assets.companyId, companyId))
    .orderBy(trKey(assets.name), asc(assets.id))
    .all();
}

export const MAX_LABELS = 500;

/** Devices matching a list filter, unpaged, for printing labels (capped at MAX_LABELS). */
export function listAssetsForLabels(
  db: Db,
  actor: Actor,
  companyId: number,
  filter: AssetFilter = {},
): { id: number; tag: string; name: string }[] {
  getCompany(db, actor, companyId);
  return db
    .select({ id: assets.id, tag: assets.tag, name: assets.name })
    .from(assets)
    .where(filterWhere(companyId, filter))
    .orderBy(trKey(assets.tag), asc(assets.id))
    .limit(MAX_LABELS)
    .all();
}

/** Finds the device a printed label points at. */
export function getAssetByTag(db: Db, actor: Actor, companyId: number, tag: string): { id: number } {
  getCompany(db, actor, companyId);
  const find = (match: SQL) => db.select({ id: assets.id }).from(assets).where(and(eq(assets.companyId, companyId), match)).get();
  // Exact first; then ignoring case, for labels printed before tags were stored in capitals.
  const row = find(eq(assets.tag, tag)) ?? find(sql`upper(${assets.tag}) = upper(${tag})`);
  if (!row) throw new AppError("notFound");
  return row;
}

export type ModelSpecs = {
  /** The device the values come from, shown to the user. */
  sourceTag: string;
  sourceName: string;
  cpu: string | null;
  ramGb: number | null;
  storage: string | null;
  os: string | null;
};

/**
 * Specifications of another device of the same brand and model, to prefill a
 * new one. Looks only in companies the actor may access; the newest match wins.
 * Per-device values (serial, computer name, addresses) are never copied.
 */
export function findModelSpecs(db: Db, actor: Actor, brand: string, model: string, excludeAssetId?: number): ModelSpecs | null {
  const wantedBrand = fold(brand);
  const wantedModel = fold(model);
  if (!wantedBrand || !wantedModel) return null;
  const companyIds = listCompanies(db, actor).map((c) => c.id);
  if (companyIds.length === 0) return null;

  const match = db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      brand: assets.brand,
      model: assets.model,
      cpu: assets.cpu,
      ramGb: assets.ramGb,
      storage: assets.storage,
      os: assets.os,
    })
    .from(assets)
    .where(
      and(
        inArray(assets.companyId, companyIds),
        isNotNull(assets.brand),
        isNotNull(assets.model),
        or(isNotNull(assets.cpu), isNotNull(assets.ramGb), isNotNull(assets.storage), isNotNull(assets.os)),
      ),
    )
    .orderBy(desc(assets.updatedAt), desc(assets.id))
    .all()
    // Compared in code: SQLite cannot fold Turkish letters or ignore spacing.
    .find((a) => a.id !== excludeAssetId && fold(a.brand ?? "") === wantedBrand && fold(a.model ?? "") === wantedModel);

  return match
    ? { sourceTag: match.tag, sourceName: match.name, cpu: match.cpu, ramGb: match.ramGb, storage: match.storage, os: match.os }
    : null;
}
