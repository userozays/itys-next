import { hashPassword } from "../auth/password";
import type { Actor } from "../auth/sessions";
import { openDb, type Db } from "../db/client";
import { companies, userCompanies, users, type Role } from "../db/schema";
import { FieldErrors } from "../errors";
import type { AssetInput } from "../validation";

export const PASSWORD = "correct-horse-battery";

let cachedHash: Promise<string> | undefined;

export function testDb(): Db {
  return openDb(":memory:");
}

export async function addUser(
  db: Db,
  username: string,
  role: Role = "technician",
  opts: { active?: boolean; companyIds?: number[]; canSeeLicenseKeys?: boolean } = {},
): Promise<Actor> {
  cachedHash ??= hashPassword(PASSWORD);
  const row = db
    .insert(users)
    .values({
      username,
      name: username,
      passwordHash: await cachedHash,
      role,
      active: opts.active ?? true,
      canSeeLicenseKeys: opts.canSeeLicenseKeys ?? false,
    })
    .returning()
    .get();
  for (const companyId of opts.companyIds ?? []) {
    db.insert(userCompanies).values({ userId: row.id, companyId }).run();
  }
  return { id: row.id, username: row.username, name: row.name, role: row.role, canSeeLicenseKeys: row.canSeeLicenseKeys };
}

export function addCompany(db: Db, name: string, active = true): number {
  return db.insert(companies).values({ name, active }).returning().get().id;
}

/** A valid asset input; override only what the test is about. */
export function assetInput(overrides: Partial<AssetInput> = {}): AssetInput {
  return { name: "Dell OptiPlex", type: "computer", status: "in_use", ...overrides };
}

/** The field issues a call fails with, as "field:key" strings; [] if it does not fail that way. */
export function fieldIssuesOf(call: () => unknown): string[] {
  try {
    call();
  } catch (e) {
    if (e instanceof FieldErrors) return e.issues.map((i) => `${i.field}:${i.key}`);
    throw e;
  }
  return [];
}
