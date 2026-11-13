import { and, asc, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { loginAttempts, users } from "../db/schema";
import { dummyHash, verifyPassword } from "./password";
import { createSession } from "./sessions";

const WINDOW = 15 * 60; // seconds

/**
 * How many failures within the window lock a key. The tight limit applies only
 * to one username from one address, so somebody elsewhere cannot lock a user
 * out by guessing. The wide limits stop guessing spread over many addresses
 * or many usernames, and are set high enough not to trip in ordinary use.
 */
export const LIMITS = { pair: 5, username: 30, ip: 100 } as const;

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" }
  /** `retryAfter`: seconds until another attempt is allowed. */
  | { ok: false; reason: "locked"; retryAfter: number };

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** Seconds until `key` drops back under its limit; 0 when it is not locked. */
function lockedFor(db: Db, key: string, max: number, t: number): number {
  const times = db
    .select({ at: loginAttempts.at })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, t - WINDOW)))
    .orderBy(asc(loginAttempts.at))
    .all();
  if (times.length < max) return 0;
  // Unlocked once enough of the oldest failures have left the window.
  return times[times.length - max]!.at + WINDOW - t;
}

/**
 * Verifies credentials and opens a session.
 * - Too many recent failures → "locked", without checking the password.
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
  const keys = {
    pair: `p:${username}|${input.ip}`,
    username: `u:${username}`,
    ip: `ip:${input.ip}`,
  };

  db.delete(loginAttempts).where(lt(loginAttempts.at, t - WINDOW)).run();
  const retryAfter = Math.max(
    lockedFor(db, keys.pair, LIMITS.pair, t),
    lockedFor(db, keys.username, LIMITS.username, t),
    lockedFor(db, keys.ip, LIMITS.ip, t),
  );
  if (retryAfter > 0) return { ok: false, reason: "locked", retryAfter };

  const user = db.select().from(users).where(eq(users.username, username)).get();
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));

  if (!user || !passwordOk || !user.active) {
    db.insert(loginAttempts)
      .values(Object.values(keys).map((key) => ({ key, at: t })))
      .run();
    return { ok: false, reason: "invalid" };
  }

  // The person at this address proved who they are; their own mistakes are forgotten.
  db.delete(loginAttempts).where(eq(loginAttempts.key, keys.pair)).run();
  return { ok: true, token: createSession(db, user.id, now) };
}
