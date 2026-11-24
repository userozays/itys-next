import { count, eq } from "drizzle-orm";
import { assertCan, can } from "../auth/permissions";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, locations, type Location } from "../db/schema";
import { AppError } from "../errors";
import type { LocationInput } from "../validation";
import { getCompany } from "./companies";

export type LocationWithCount = Location & { assetCount: number };

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE/.test(e.message);

/** Loads a location only if the actor may access its company. */
function getLocation(db: Db, actor: Actor, locationId: number): Location {
  const row = db.select().from(locations).where(eq(locations.id, locationId)).get();
  if (!row) throw new AppError("notFound");
  getCompany(db, actor, row.companyId);
  return row;
}

export function listLocations(db: Db, actor: Actor, companyId: number): LocationWithCount[] {
  getCompany(db, actor, companyId);
  // A join rather than a sub-select: inside a raw sub-select Drizzle writes
  // column names without their table, so "id" there meant assets.id.
  return db
    .select({
      id: locations.id,
      companyId: locations.companyId,
      name: locations.name,
      createdAt: locations.createdAt,
      assetCount: count(assets.id),
    })
    .from(locations)
    .leftJoin(assets, eq(assets.locationId, locations.id))
    .where(eq(locations.companyId, companyId))
    .groupBy(locations.id)
    .all()
    // Sorted here because SQLite puts Ç, İ, Ö, Ş, Ü after Z.
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** QA O4: "Depo" and "depo" are the same location. */
function assertNameFree(db: DbOrTx, companyId: number, name: string, excludeId?: number): void {
  const wanted = name.toLocaleLowerCase("tr");
  const clash = db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.companyId, companyId))
    .all()
    .some((l) => l.id !== excludeId && l.name.toLocaleLowerCase("tr") === wanted);
  if (clash) throw new AppError("locationNameTaken");
}

export function createLocation(db: DbOrTx, actor: Actor, companyId: number, input: LocationInput): Location {
  assertCan(can.editInventory(actor));
  getCompany(db, actor, companyId);
  assertNameFree(db, companyId, input.name);
  try {
    return db.insert(locations).values({ companyId, name: input.name }).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("locationNameTaken");
    throw e;
  }
}

export function renameLocation(db: Db, actor: Actor, locationId: number, input: LocationInput): Location {
  assertCan(can.editInventory(actor));
  const current = getLocation(db, actor, locationId);
  assertNameFree(db, current.companyId, input.name, current.id);
  try {
    return db.update(locations).set({ name: input.name }).where(eq(locations.id, current.id)).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("locationNameTaken");
    throw e;
  }
}

/** Admin only. Assets at this location stay, with their location cleared. */
export function deleteLocation(db: Db, actor: Actor, locationId: number): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
  const current = getLocation(db, actor, locationId);
  db.delete(locations).where(eq(locations.id, current.id)).run();
}
