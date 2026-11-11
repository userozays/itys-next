import { eq } from "drizzle-orm";
import type { Actor } from "../auth/sessions";
import { decryptSecret, encryptSecret } from "../crypto/secrets";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { AppError } from "../errors";
import type { NotificationSettingsInput } from "../validation";

const KEY = "notifications";

type Stored = {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordEnc: string | null;
  smtpFrom: string;
  emailTo: string[];
  telegramEnabled: boolean;
  telegramTokenEnc: string | null;
  telegramChatId: string;
};

const defaults: Stored = {
  emailEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPasswordEnc: null,
  smtpFrom: "",
  emailTo: [],
  telegramEnabled: false,
  telegramTokenEnc: null,
  telegramChatId: "",
};

/** Settings as shown to an admin: secrets are reduced to "is one stored?". */
export type NotificationSettings = Omit<Stored, "smtpPasswordEnc" | "telegramTokenEnc"> & {
  hasSmtpPassword: boolean;
  hasTelegramToken: boolean;
};

/** Settings as needed to actually send, with secrets decrypted. Server-internal. */
export type DeliveryConfig = Omit<Stored, "smtpPasswordEnc" | "telegramTokenEnc"> & {
  smtpPassword: string | null;
  telegramToken: string | null;
};

function read(db: Db): Stored {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  return { ...defaults, ...(row?.value as Partial<Stored> | undefined) };
}

function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new AppError("forbidden");
}

export function getNotificationSettings(db: Db, actor: Actor): NotificationSettings {
  assertAdmin(actor);
  const { smtpPasswordEnc, telegramTokenEnc, ...rest } = read(db);
  return { ...rest, hasSmtpPassword: smtpPasswordEnc !== null, hasTelegramToken: telegramTokenEnc !== null };
}

export function saveNotificationSettings(db: Db, actor: Actor, input: NotificationSettingsInput): void {
  assertAdmin(actor);
  const current = read(db);
  const telegramTokenEnc = input.telegramToken ? encryptSecret(input.telegramToken) : current.telegramTokenEnc;
  if (input.telegramEnabled && !telegramTokenEnc) throw new AppError("telegramTokenMissing");

  const value: Stored = {
    emailEnabled: input.emailEnabled,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    smtpUser: input.smtpUser,
    // Clearing the user name also drops the password that went with it.
    smtpPasswordEnc: input.smtpPassword ? encryptSecret(input.smtpPassword) : input.smtpUser ? current.smtpPasswordEnc : null,
    smtpFrom: input.smtpFrom,
    emailTo: input.emailTo,
    telegramEnabled: input.telegramEnabled,
    telegramTokenEnc,
    telegramChatId: input.telegramChatId,
  };
  db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function loadDeliveryConfig(db: Db): DeliveryConfig {
  const { smtpPasswordEnc, telegramTokenEnc, ...rest } = read(db);
  return {
    ...rest,
    smtpPassword: smtpPasswordEnc ? decryptSecret(smtpPasswordEnc) : null,
    telegramToken: telegramTokenEnc ? decryptSecret(telegramTokenEnc) : null,
  };
}
