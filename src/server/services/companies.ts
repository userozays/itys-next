import { and, eq, inArray } from "drizzle-orm";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { companies, userCompanies, type Company } from "../db/schema";
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
 *  may access it, otherwise their first accessible active company. */
export function resolveActiveCompany(db: Db, actor: Actor, preferredId: number | null): Company | null {
  const available = listCompanies(db, actor).filter((c) => c.active);
  return available.find((c) => c.id === preferredId) ?? available[0] ?? null;
}

export function createCompany(db: Db, actor: Actor, input: CompanyInput): Company {
  assertAdmin(actor);
  try {
    return db.insert(companies).values(input).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("companyNameTaken");
    throw e;
  }
}

export function updateCompany(db: Db, actor: Actor, companyId: number, input: CompanyInput): Company {
  assertAdmin(actor);
  try {
    const row = db.update(companies).set(input).where(eq(companies.id, companyId)).returning().get();
    if (!row) throw new AppError("notFound");
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("companyNameTaken");
    throw e;
  }
}
