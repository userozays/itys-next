import { and, asc, eq, ne, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../auth/password";
import { deleteUserSessions, type Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { userCompanies, users, type Role } from "../db/schema";
import { AppError } from "../errors";
import type { FirstAdminInput, NewUserInput, UserUpdateInput } from "../validation";

export type UserListItem = {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  companyIds: number[];
};

function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
}

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE/.test(e.message);

function setCompanies(db: DbOrTx, userId: number, role: Role, companyIds: number[]): void {
  db.delete(userCompanies).where(eq(userCompanies.userId, userId)).run();
  // Admins see every company, so assignments are only kept for technicians.
  const unique = role === "technician" ? [...new Set(companyIds)] : [];
  if (unique.length > 0) {
    db.insert(userCompanies)
      .values(unique.map((companyId) => ({ userId, companyId })))
      .run();
  }
}

export function needsSetup(db: Db): boolean {
  return db.select({ id: users.id }).from(users).limit(1).get() === undefined;
}

/** Creates the very first administrator. Refuses once any user exists. */
export async function createFirstAdmin(db: Db, input: FirstAdminInput): Promise<number> {
  const passwordHash = await hashPassword(input.password);
  return db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).limit(1).get()) throw new AppError("setupDone");
    return tx
      .insert(users)
      .values({ username: input.username, name: input.name, passwordHash, role: "admin" })
      .returning({ id: users.id })
      .get().id;
  });
}

export function listUsers(db: Db, actor: Actor): UserListItem[] {
  assertAdmin(actor);
  const rows = db
    .select({ id: users.id, username: users.username, name: users.name, role: users.role, active: users.active })
    .from(users)
    .orderBy(asc(users.username))
    .all();
  const links = db.select().from(userCompanies).all();
  return rows.map((u) => ({
    ...u,
    companyIds: links.filter((l) => l.userId === u.id).map((l) => l.companyId),
  }));
}

export async function createUser(db: Db, actor: Actor, input: NewUserInput): Promise<number> {
  assertAdmin(actor);
  const passwordHash = await hashPassword(input.password);
  try {
    return db.transaction((tx) => {
      const { id } = tx
        .insert(users)
        .values({ username: input.username, name: input.name, passwordHash, role: input.role })
        .returning({ id: users.id })
        .get();
      setCompanies(tx, id, input.role, input.companyIds);
      return id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("usernameTaken");
    throw e;
  }
}

export function updateUser(db: Db, actor: Actor, userId: number, input: UserUpdateInput): void {
  assertAdmin(actor);
  db.transaction((tx) => {
    const current = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!current) throw new AppError("notFound");

    const losesAdmin = current.role === "admin" && current.active && (input.role !== "admin" || !input.active);
    if (losesAdmin) {
      const others = tx
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, userId)))
        .get();
      if ((others?.n ?? 0) === 0) throw new AppError("lastAdmin");
    }

    tx.update(users)
      .set({ name: input.name, role: input.role, active: input.active })
      .where(eq(users.id, userId))
      .run();
    setCompanies(tx, userId, input.role, input.companyIds);
    if (!input.active) deleteUserSessions(tx, userId);
  });
}

/** Admin sets a new password for someone; all of that user's sessions end. */
export async function resetPassword(db: Db, actor: Actor, userId: number, newPassword: string): Promise<void> {
  assertAdmin(actor);
  const passwordHash = await hashPassword(newPassword);
  const row = db.update(users).set({ passwordHash }).where(eq(users.id, userId)).returning({ id: users.id }).get();
  if (!row) throw new AppError("notFound");
  deleteUserSessions(db, userId);
}

/** A user changes their own password. Other sessions end; the caller re-issues the current one. */
export async function changeOwnPassword(
  db: Db,
  actor: Actor,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = db.select().from(users).where(eq(users.id, actor.id)).get();
  if (!user) throw new AppError("notFound");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new AppError("wrongPassword");
  const passwordHash = await hashPassword(newPassword);
  db.update(users).set({ passwordHash }).where(eq(users.id, actor.id)).run();
  deleteUserSessions(db, actor.id);
}
