"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireActor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { checked, runForm, text } from "@/server/form";
import { buildTestMessage } from "@/server/notify/messages";
import { deliverPending, enqueue } from "@/server/notify/outbox";
import { tick } from "@/server/notify/scheduler";
import { createSenders, enabledChannels } from "@/server/notify/senders";
import { loadDeliveryConfig, saveNotificationSettings } from "@/server/services/notification-settings";
import { notificationSettingsInput } from "@/server/validation";

async function requireAdminActor() {
  const actor = await requireActor();
  if (actor.role !== "admin") throw new AppError("forbidden");
  return actor;
}

export async function saveNotificationSettingsAction(form: FormData): Promise<FormState> {
  return runForm(async () => {
    const actor = await requireAdminActor();
    const input = notificationSettingsInput.parse({
      emailEnabled: checked(form, "emailEnabled"),
      smtpHost: text(form, "smtpHost"),
      smtpPort: text(form, "smtpPort") || "587",
      smtpSecure: checked(form, "smtpSecure"),
      smtpUser: text(form, "smtpUser"),
      smtpPassword: text(form, "smtpPassword"),
      smtpFrom: text(form, "smtpFrom"),
      emailTo: text(form, "emailTo"),
      telegramEnabled: checked(form, "telegramEnabled"),
      telegramToken: text(form, "telegramToken"),
      telegramChatId: text(form, "telegramChatId"),
    });
    saveNotificationSettings(getDb(), actor, input);
    revalidatePath("/notifications");
  });
}

/** Sends a test message through every channel that is switched on, right now. */
export async function sendTestNotificationAction(): Promise<FormState> {
  let result = { sent: 0, failed: 0 };
  const state = await runForm(async () => {
    await requireAdminActor();
    const db = getDb();
    const config = loadDeliveryConfig(db);
    const channels = enabledChannels(config);
    if (channels.length === 0) throw new AppError("noChannelEnabled");
    for (const channel of channels) enqueue(db, channel, buildTestMessage());
    result = await deliverPending(db, createSenders(config));
    revalidatePath("/notifications");
  });
  if (!state.ok) return state;
  const t = await getTranslations("notifications");
  return { ok: true, message: t("testResult", result) };
}

/** Runs the expiry check and delivery immediately, regardless of the time of day. */
export async function checkNowAction(): Promise<FormState> {
  let result = { raised: 0, sent: 0, failed: 0 };
  const state = await runForm(async () => {
    await requireAdminActor();
    const db = getDb();
    if (enabledChannels(loadDeliveryConfig(db)).length === 0) throw new AppError("noChannelEnabled");
    result = await tick(db, new Date(), true);
    revalidatePath("/notifications");
  });
  if (!state.ok) return state;
  const t = await getTranslations("notifications");
  return { ok: true, message: t("checkResult", result) };
}
