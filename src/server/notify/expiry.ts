import { and, eq, isNotNull, ne } from "drizzle-orm";
import { daysBetween } from "../../lib/dates";
import type { Actor } from "../auth/sessions";
import type { Db, DbOrTx } from "../db/client";
import { assets, companies, expiryNotices, licenses, type NotificationChannel } from "../db/schema";
import { getCompany } from "../services/companies";
import { buildDigest, type DueItem } from "./messages";
import { enqueue } from "./outbox";
import { thresholdFor } from "./thresholds";

type Candidate = DueItem & { threshold: number };

/** Every warranty and license of an active company whose date is near or just past. */
function candidates(db: DbOrTx, today: string, companyId?: number): Candidate[] {
  const scope = companyId === undefined ? eq(companies.active, true) : eq(companies.id, companyId);

  const warranties = db
    .select({ refId: assets.id, name: assets.name, tag: assets.tag, dueDate: assets.warrantyEnd, companyName: companies.name })
    .from(assets)
    .innerJoin(companies, eq(companies.id, assets.companyId))
    .where(and(scope, isNotNull(assets.warrantyEnd), ne(assets.status, "retired")))
    .all()
    .map((r) => ({ kind: "warranty" as const, refId: r.refId, label: `${r.name} (${r.tag})`, dueDate: r.dueDate!, companyName: r.companyName }));

  const licenseRows = db
    .select({ refId: licenses.id, name: licenses.name, dueDate: licenses.expiryDate, companyName: companies.name })
    .from(licenses)
    .innerJoin(companies, eq(companies.id, licenses.companyId))
    .where(and(scope, isNotNull(licenses.expiryDate)))
    .all()
    .map((r) => ({ kind: "license" as const, refId: r.refId, label: r.name, dueDate: r.dueDate!, companyName: r.companyName }));

  return [...warranties, ...licenseRows].flatMap((item) => {
    const daysLeft = daysBetween(today, item.dueDate);
    const threshold = thresholdFor(daysLeft);
    return threshold === null ? [] : [{ ...item, daysLeft, threshold }];
  });
}

/**
 * Raises the warnings that have become due and queues one digest per channel.
 * Each (item, threshold, due date) is raised once. With no channel enabled
 * nothing is recorded, so switching a channel on later still reports what is current.
 */
export function runExpiryCheck(db: Db, today: string, channels: NotificationChannel[], now = new Date()): { raised: number } {
  if (channels.length === 0) return { raised: 0 };
  return db.transaction((tx) => {
    const fresh = candidates(tx, today).filter((c) => {
      const inserted = tx
        .insert(expiryNotices)
        .values({ kind: c.kind, refId: c.refId, threshold: c.threshold, dueDate: c.dueDate })
        .onConflictDoNothing()
        .returning({ id: expiryNotices.id })
        .get();
      return inserted !== undefined;
    });
    if (fresh.length === 0) return { raised: 0 };
    const digest = buildDigest(fresh);
    for (const channel of channels) enqueue(tx, channel, digest, now);
    return { raised: fresh.length };
  });
}

/** What is expiring soon or just expired in one company, soonest first (for the dashboard). */
export function upcomingExpiries(db: Db, actor: Actor, companyId: number, today: string): DueItem[] {
  getCompany(db, actor, companyId);
  return candidates(db, today, companyId)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.label.localeCompare(b.label, "tr"))
    .map(({ kind, refId, companyName, label, dueDate, daysLeft }) => ({ kind, refId, companyName, label, dueDate, daysLeft }));
}
