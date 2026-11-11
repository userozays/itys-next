import { todayIso } from "../../lib/dates";
import { getDb, type Db } from "../db/client";
import { loadDeliveryConfig } from "../services/notification-settings";
import { runExpiryCheck } from "./expiry";
import { deliverPending } from "./outbox";
import { createSenders, enabledChannels } from "./senders";

const INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;

export type TickResult = { raised: number; sent: number; failed: number };

/**
 * One round of background work: raise expiry warnings that have become due
 * (daytime only, so nobody is messaged at night; `force` skips that), then
 * deliver whatever is waiting in the outbox.
 */
export async function tick(db: Db, now = new Date(), force = false): Promise<TickResult> {
  const config = loadDeliveryConfig(db);
  const daytime = now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR;
  const raised = force || daytime ? runExpiryCheck(db, todayIso(now), enabledChannels(config), now).raised : 0;
  return { raised, ...(await deliverPending(db, createSenders(config), now)) };
}

const globalForScheduler = globalThis as unknown as { __schedulerStarted?: boolean };

/** Starts the background timer once per process. Called from src/instrumentation.ts. */
export function startScheduler(): void {
  if (globalForScheduler.__schedulerStarted || process.env.DISABLE_SCHEDULER === "1") return;
  globalForScheduler.__schedulerStarted = true;
  const run = () => {
    tick(getDb()).catch((e) => console.error("[scheduler] tick failed:", e));
  };
  setTimeout(run, FIRST_RUN_MS).unref();
  setInterval(run, INTERVAL_MS).unref();
}
