import nodemailer from "nodemailer";
import type { DeliveryConfig } from "../services/notification-settings";
import type { Message } from "./messages";
import type { Senders } from "./outbox";

const TIMEOUT_MS = 15_000;

export function emailSender(config: DeliveryConfig, transport = nodemailer.createTransport) {
  return async (message: Message) => {
    const mailer = transport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword ?? "" } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    await mailer.sendMail({ from: config.smtpFrom, to: config.emailTo, subject: message.subject, text: message.body });
  };
}

export function telegramSender(config: DeliveryConfig, fetchFn: typeof fetch = fetch) {
  // TELEGRAM_API_URL exists so tests can point at a local stand-in.
  const base = (process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/+$/, "");
  return async (message: Message) => {
    const response = await fetchFn(`${base}/bot${config.telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text: `${message.subject}\n\n${message.body}`.slice(0, 4000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // The URL contains the bot token, so only the status and Telegram's own description are reported.
      const detail = await response.json().then((j: { description?: string }) => j.description, () => undefined);
      throw new Error(`Telegram ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  };
}

/** Senders for the channels that are switched on. */
export function createSenders(config: DeliveryConfig): Senders {
  return {
    ...(config.emailEnabled ? { email: emailSender(config) } : {}),
    ...(config.telegramEnabled && config.telegramToken ? { telegram: telegramSender(config) } : {}),
  };
}

export function enabledChannels(config: DeliveryConfig) {
  return Object.keys(createSenders(config)) as (keyof Senders)[];
}
