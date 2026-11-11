import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { notifications, type NotificationChannel } from "../db/schema";
import { AppError } from "../errors";
import type { Message } from "./messages";

export const MAX_ATTEMPTS = 5;
const FIRST_RETRY = 5 * 60; // seconds; doubles after every failure

export type Sender = (message: Message) => Promise<void>;
export type Senders = Partial<Record<NotificationChannel, Sender>>;

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

export function enqueue(db: DbOrTx, channel: NotificationChannel, message: Message, now = new Date()): number {
  const t = seconds(now);
  return db
    .insert(notifications)
    .values({ channel, subject: message.subject, body: message.body, nextAttemptAt: t, createdAt: t })
    .returning({ id: notifications.id })
    .get().id;
}

/**
 * Sends every pending message that is due. A failure is retried after 5, 10,
 * 20 and 40 minutes; after the fifth failure the message is marked failed.
 */
export async function deliverPending(db: Db, senders: Senders, now = new Date()): Promise<{ sent: number; failed: number }> {
  const t = seconds(now);
  const due = db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "pending"), lte(notifications.nextAttemptAt, t)))
    .orderBy(asc(notifications.id))
    .all();

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const attempts = row.attempts + 1;
    try {
      const send = senders[row.channel];
      if (!send) throw new Error("Channel is not configured.");
      await send({ subject: row.subject, body: row.body });
      db.update(notifications).set({ status: "sent", attempts, sentAt: t, lastError: null }).where(eq(notifications.id, row.id)).run();
      sent++;
    } catch (e) {
      const giveUp = attempts >= MAX_ATTEMPTS;
      db.update(notifications)
        .set({
          status: giveUp ? "failed" : "pending",
          attempts,
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          nextAttemptAt: t + FIRST_RETRY * 2 ** (attempts - 1),
        })
        .where(eq(notifications.id, row.id))
        .run();
      failed++;
    }
  }
  return { sent, failed };
}

export type NotificationRow = typeof notifications.$inferSelect;

/** Most recent messages first. Admin only: bodies name devices of every company. */
export function listNotifications(db: Db, actor: Actor, limit = 50): NotificationRow[] {
  if (actor.role !== "admin") throw new AppError("forbidden");
  return db.select().from(notifications).orderBy(desc(notifications.id)).limit(limit).all();
}
