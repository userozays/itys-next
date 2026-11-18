import { and, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, companies, licenses, locations, userCompanies, type Company } from "../db/schema";
import { AppError } from "../errors";
import type { CompanyInput } from "../validation";

function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
}

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE/.test(e.message);

// SQLite orders text by byte value, which puts Ç, İ, Ö, Ş, Ü after Z. Short lists are sorted here instead.
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");

/** Companies the actor may work with. Admins: all. Technicians: assigned and active only. */
export function listCompanies(db: DbOrTx, actor: Actor): Company[] {
  if (actor.role === "admin") {
    return db.select().from(companies).all().sort(byName);
  }
  const ids = db
    .select({ id: userCompanies.companyId })
    .from(userCompanies)
    .where(eq(userCompanies.userId, actor.id));
  return db
    .select()
    .from(companies)
    .where(and(inArray(companies.id, ids), eq(companies.active, true)))
    .all()
    .sort(byName);
}

/** The single gate for per-company access: returns the company or throws. */
export function getCompany(db: DbOrTx, actor: Actor, companyId: number): Company {
  const company = listCompanies(db, actor).find((c) => c.id === companyId);
  if (!company) throw new AppError("notFound");
  return company;
}

/** The company the actor is currently working in: the preferred one if they
 *  may access it, otherwise their first accessible active company. An admin may
 *  also work in an inactive company, to look at its records (QA Ö7); nobody
 *  lands in one without choosing it. */
export function resolveActiveCompany(db: Db, actor: Actor, preferredId: number | null): Company | null {
  const accessible = listCompanies(db, actor);
  const preferred = accessible.find((c) => c.id === preferredId);
  if (preferred && (preferred.active || actor.role === "admin")) return preferred;
  return accessible.find((c) => c.active) ?? null;
}

/** QA O4: "Akdeniz Lojistik" and "akdeniz lojistik" are the same company. */
function assertNameFree(db: Db, name: string, excludeId?: number): void {
  const wanted = name.toLocaleLowerCase("tr");
  const clash = db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .all()
    .some((c) => c.id !== excludeId && c.name.toLocaleLowerCase("tr") === wanted);
  if (clash) throw new AppError("companyNameTaken");
}

export function createCompany(db: Db, actor: Actor, input: CompanyInput): Company {
  assertAdmin(actor);
  assertNameFree(db, input.name);
  try {
    return db.insert(companies).values(input).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("companyNameTaken");
    throw e;
  }
}

export function updateCompany(db: Db, actor: Actor, companyId: number, input: CompanyInput): Company {
  assertAdmin(actor);
  assertNameFree(db, input.name, companyId);
  try {
    const row = db.update(companies).set(input).where(eq(companies.id, companyId)).returning().get();
    if (!row) throw new AppError("notFound");
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("companyNameTaken");
    throw e;
  }
}

/** Devices, licenses and locations per company; a company with none can be deleted (QA Ö8). */
export function companyRecordCounts(db: DbOrTx, actor: Actor): Map<number, number> {
  assertAdmin(actor);
  const counts = new Map<number, number>();
  for (const table of [assets, licenses, locations]) {
    const rows = db
      .select({ companyId: table.companyId, n: sql<number>`count(*)` })
      .from(table)
      .groupBy(table.companyId)
      .all();
    for (const r of rows) counts.set(r.companyId, (counts.get(r.companyId) ?? 0) + r.n);
  }
  return counts;
}

/**
 * Permanently deletes a company that has no devices, licenses or locations, for
 * one added by mistake. A company with records is made inactive instead, so
 * nothing is lost (QA Ö8). Technician assignments and unfinished imports go with it.
 */
export function deleteCompany(db: Db, actor: Actor, companyId: number): void {
  assertAdmin(actor);
  db.transaction((tx) => {
    const company = tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get();
    if (!company) throw new AppError("notFound");
    if ((companyRecordCounts(tx, actor).get(companyId) ?? 0) > 0) throw new AppError("companyHasRecords");
    tx.delete(companies).where(eq(companies.id, companyId)).run();
  });
}
