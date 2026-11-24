import { and, eq, lt, sql } from "drizzle-orm";
import { assertCan, can } from "../auth/permissions";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, importJobs, locations } from "../db/schema";
import { AppError } from "../errors";
import { fold, guessMapping, sanitizeMapping, type Mapping } from "../import/mapping";
import { normalizeRow, type NormalizedRow, type RowIssue } from "../import/normalize";
import type { ParsedSheet } from "../import/parse";
import { normalizeMac } from "../validation";
import { createAsset, meaningfulSerial, tagAllocator } from "./assets";
import { getCompany } from "./companies";
import { createLocation } from "./locations";

export type SkippedRow = { row: number; issues: RowIssue[] };

export type ImportJob = {
  id: number;
  companyId: number;
  filename: string;
  headers: string[];
  rows: string[][];
  mapping: Mapping;
  status: "pending" | "done";
  importedCount: number;
  report: SkippedRow[];
};

export type ImportPreview = {
  total: number;
  valid: { row: number; value: NormalizedRow }[];
  skipped: SkippedRow[];
  /** Location names in the file that do not exist yet and would be created. */
  newLocations: string[];
};

/** Stores an uploaded sheet for the company and guesses the column mapping. */
export function createImportJob(db: Db, actor: Actor, companyId: number, filename: string, sheet: ParsedSheet): number {
  assertCan(can.editInventory(actor));
  getCompany(db, actor, companyId);
  // Abandoned uploads are not kept around.
  db.delete(importJobs)
    .where(and(eq(importJobs.status, "pending"), lt(importJobs.createdAt, sql`datetime('now', '-1 day')`)))
    .run();
  return db
    .insert(importJobs)
    .values({
      companyId,
      userId: actor.id,
      filename: filename.slice(0, 200),
      headers: sheet.headers,
      rows: sheet.rows,
      mapping: guessMapping(sheet.headers),
    })
    .returning({ id: importJobs.id })
    .get().id;
}

/** Loads an import only if the actor may access its company. */
export function getImportJob(db: Db, actor: Actor, jobId: number): ImportJob {
  assertCan(can.editInventory(actor));
  const row = db.select().from(importJobs).where(eq(importJobs.id, jobId)).get();
  if (!row) throw new AppError("notFound");
  getCompany(db, actor, row.companyId);
  return {
    id: row.id,
    companyId: row.companyId,
    filename: row.filename,
    headers: row.headers,
    rows: row.rows,
    mapping: sanitizeMapping(row.mapping, row.headers.length),
    status: row.status,
    importedCount: row.importedCount,
    report: (row.report ?? []) as SkippedRow[],
  };
}

export function setImportMapping(db: Db, actor: Actor, jobId: number, raw: Record<string, unknown>): void {
  const job = getImportJob(db, actor, jobId);
  if (job.status === "done") throw new AppError("importDone");
  db.update(importJobs)
    .set({ mapping: sanitizeMapping(raw, job.headers.length) })
    .where(eq(importJobs.id, job.id))
    .run();
}

function preview(db: DbOrTx, job: ImportJob): ImportPreview {
  // Tags, serials and MAC addresses already used in the company, in capitals (QA O4, O6).
  const existing = db
    .select({ tag: assets.tag, serial: assets.serial, mac: assets.macAddress })
    .from(assets)
    .where(eq(assets.companyId, job.companyId))
    .all();
  const upper = (values: (string | null)[]) => new Set(values.flatMap((v) => (v ? [v.toUpperCase()] : [])));
  const taken = {
    tag: upper(existing.map((r) => r.tag)),
    serial: upper(existing.map((r) => r.serial)),
    macAddress: upper(existing.map((r) => r.mac)),
  };
  const seen = { tag: new Set<string>(), serial: new Set<string>(), macAddress: new Set<string>() };
  const existingLocations = new Set(
    db.select({ name: locations.name }).from(locations).where(eq(locations.companyId, job.companyId)).all().map((r) => fold(r.name)),
  );
  const newLocations = new Map<string, string>();
  const valid: ImportPreview["valid"] = [];
  const skipped: SkippedRow[] = [];

  job.rows.forEach((cells, index) => {
    const row = index + 2; // 1-based, after the header row: matches the spreadsheet.
    const result = normalizeRow(cells, job.mapping);

    // Duplicates are checked on rows with other problems too, so a row lists everything
    // wrong with it at once (QA D11). Read from the cells, as a failed row has no value.
    const cell = (field: "tag" | "serial" | "macAddress") => {
      const index = job.mapping[field];
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };
    const serial = cell("serial");
    const keys = {
      tag: cell("tag").toUpperCase() || undefined,
      serial: serial && meaningfulSerial(serial) ? serial.toUpperCase() : undefined,
      macAddress: normalizeMac(cell("macAddress")) ?? undefined,
    };
    const issues: RowIssue[] = result.ok ? [] : [...result.issues];
    for (const field of ["tag", "serial", "macAddress"] as const) {
      const key = keys[field];
      if (!key || issues.some((i) => i.field === field)) continue;
      const prefix = field === "macAddress" ? "mac" : field;
      if (taken[field].has(key)) issues.push({ field, code: `${prefix}Taken` });
      else if (seen[field].has(key)) issues.push({ field, code: `${prefix}Duplicate` });
    }
    if (!result.ok || issues.length > 0) return void skipped.push({ row, issues });
    for (const field of ["tag", "serial", "macAddress"] as const) if (keys[field]) seen[field].add(keys[field]!);

    const location = result.value.locationName;
    if (location && !existingLocations.has(fold(location)) && !newLocations.has(fold(location))) {
      newLocations.set(fold(location), location);
    }
    valid.push({ row, value: result.value });
  });

  return { total: job.rows.length, valid, skipped, newLocations: [...newLocations.values()] };
}

/** What would happen if the import ran now, with the current mapping. */
export function previewImport(db: Db, actor: Actor, jobId: number): ImportPreview {
  const job = getImportJob(db, actor, jobId);
  if (job.status === "done") throw new AppError("importDone");
  return preview(db, job);
}

/** Imports every valid row in one transaction; invalid rows are skipped and reported. */
export function runImport(db: Db, actor: Actor, jobId: number): { imported: number; skipped: number } {
  const job = getImportJob(db, actor, jobId);
  if (job.status === "done") throw new AppError("importDone");
  if (job.mapping.name === undefined) throw new AppError("importNoName");

  return db.transaction((tx) => {
    const { valid, skipped } = preview(tx, job);
    if (valid.length === 0) throw new AppError("importNothingValid");

    const locationIds = new Map(
      tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.companyId, job.companyId))
        .all()
        .map((l) => [fold(l.name), l.id]),
    );
    // Tags written in the file are reserved, so a generated tag cannot collide with a later row.
    const nextTag = tagAllocator(
      tx,
      job.companyId,
      valid.flatMap(({ value }) => (value.input.tag ? [value.input.tag] : [])),
    );

    for (const { value } of valid) {
      let locationId: number | null = null;
      if (value.locationName) {
        const key = fold(value.locationName);
        locationId = locationIds.get(key) ?? createLocation(tx, actor, job.companyId, { name: value.locationName }).id;
        locationIds.set(key, locationId);
      }
      createAsset(tx, actor, job.companyId, { ...value.input, tag: value.input.tag ?? nextTag(), locationId }, "import");
    }

    tx.update(importJobs)
      .set({ status: "done", importedCount: valid.length, report: skipped, rows: [] })
      .where(eq(importJobs.id, job.id))
      .run();
    return { imported: valid.length, skipped: skipped.length };
  });
}
