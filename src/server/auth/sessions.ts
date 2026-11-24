import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db, DbOrTx } from "../db/client";
import { sessions, users, type Role } from "../db/schema";

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds: absolute lifetime
const IDLE_TIMEOUT = 7 * 24 * 60 * 60; // seconds without activity
const TOUCH_INTERVAL = 60 * 60; // write last_seen_at at most hourly

export type Actor = {
  id: number;
  username: string;
  name: string;
  role: Role;
  /** Only ever true for a technician; see permissions.ts. */
  canSeeLicenseKeys: boolean;
};

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a session and returns the secret token to put in the cookie. */
export function createSession(db: Db, userId: number, now = new Date()): string {
  const token = randomBytes(32).toString("base64url");
  const t = seconds(now);
  db.insert(sessions)
    .values({ tokenHash: hashToken(token), userId, createdAt: t, lastSeenAt: t, expiresAt: t + SESSION_MAX_AGE })
    .run();
  return token;
}

/** Resolves a cookie token to its user, or null if the session is missing,
 *  expired, idle for too long, or the user has been deactivated. */
export function getSessionActor(db: Db, token: string | undefined, now = new Date()): Actor | null {
  if (!token) return null;
  const t = seconds(now);
  const row = db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      canSeeLicenseKeys: users.canSeeLicenseKeys,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, t), eq(users.active, true)))
    .get();
  if (!row) return null;
  if (t - row.lastSeenAt > IDLE_TIMEOUT) {
    db.delete(sessions).where(eq(sessions.id, row.sessionId)).run();
    return null;
  }
  if (t - row.lastSeenAt > TOUCH_INTERVAL) {
    db.update(sessions).set({ lastSeenAt: t }).where(eq(sessions.id, row.sessionId)).run();
  }
  return { id: row.id, username: row.username, name: row.name, role: row.role, canSeeLicenseKeys: row.canSeeLicenseKeys };
}

export function deleteSession(db: Db, token: string | undefined): void {
  if (token) db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}

export function deleteUserSessions(db: DbOrTx, userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
