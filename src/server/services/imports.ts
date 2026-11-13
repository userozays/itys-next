import { and, eq, lt, sql } from "drizzle-orm";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, importJobs, locations } from "../db/schema";
import { AppError } from "../errors";
import { fold, guessMapping, sanitizeMapping, type Mapping } from "../import/mapping";
import { normalizeRow, type NormalizedRow, type RowIssue } from "../import/normalize";
import type { ParsedSheet } from "../import/parse";
import { createAsset, tagAllocator } from "./assets";
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
  const existingTags = new Set(
    db.select({ tag: assets.tag }).from(assets).where(eq(assets.companyId, job.companyId)).all().map((r) => r.tag),
  );
  const existingLocations = new Set(
    db.select({ name: locations.name }).from(locations).where(eq(locations.companyId, job.companyId)).all().map((r) => fold(r.name)),
  );
  const seenTags = new Set<string>();
  const newLocations = new Map<string, string>();
  const valid: ImportPreview["valid"] = [];
  const skipped: SkippedRow[] = [];

  job.rows.forEach((cells, index) => {
    const row = index + 2; // 1-based, after the header row: matches the spreadsheet.
    const result = normalizeRow(cells, job.mapping);
    if (!result.ok) return void skipped.push({ row, issues: result.issues });

    const { tag } = result.value.input;
    if (tag && existingTags.has(tag)) return void skipped.push({ row, issues: [{ field: "tag", code: "tagTaken" }] });
    if (tag && seenTags.has(tag)) return void skipped.push({ row, issues: [{ field: "tag", code: "tagDuplicate" }] });
    if (tag) seenTags.add(tag);

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
