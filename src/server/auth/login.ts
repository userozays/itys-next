import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { loginAttempts, users } from "../db/schema";
import { dummyHash, verifyPassword } from "./password";
import { createSession } from "./sessions";

const WINDOW = 15 * 60; // seconds
const MAX_PER_USERNAME = 5;
const MAX_PER_IP = 20;

export type LoginResult = { ok: true; token: string } | { ok: false; reason: "invalid" | "locked" };

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

function failures(db: Db, key: string, since: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, since)))
    .get();
  return row?.n ?? 0;
}

/**
 * Verifies credentials and opens a session.
 * - Too many recent failures for the username or the IP → "locked", without checking the password.
 * - Unknown user, wrong password and deactivated user are indistinguishable ("invalid"),
 *   and each costs one password verification so timing does not leak which it was.
 */
export async function login(
  db: Db,
  input: { username: string; password: string; ip: string },
  now = new Date(),
): Promise<LoginResult> {
  const username = input.username.trim().toLowerCase();
  const t = seconds(now);
  const userKey = `u:${username}`;
  const ipKey = `ip:${input.ip}`;

  db.delete(loginAttempts).where(lt(loginAttempts.at, t - WINDOW)).run();
  if (
    failures(db, userKey, t - WINDOW) >= MAX_PER_USERNAME ||
    failures(db, ipKey, t - WINDOW) >= MAX_PER_IP
  ) {
    return { ok: false, reason: "locked" };
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));

  if (!user || !passwordOk || !user.active) {
    db.insert(loginAttempts)
      .values([
        { key: userKey, at: t },
        { key: ipKey, at: t },
      ])
      .run();
    return { ok: false, reason: "invalid" };
  }

  db.delete(loginAttempts).where(eq(loginAttempts.key, userKey)).run();
  return { ok: true, token: createSession(db, user.id, now) };
}
