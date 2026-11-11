import { describe, expect, it } from "vitest";
import { expiryNotices, notifications, settings } from "../db/schema";
import { createAsset, updateAsset } from "../services/assets";
import { createLicense, updateLicense } from "../services/licenses";
import { getNotificationSettings, loadDeliveryConfig, saveNotificationSettings } from "../services/notification-settings";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { notificationSettingsInput, type NotificationSettingsInput } from "../validation";
import { runExpiryCheck, upcomingExpiries } from "./expiry";
import { buildDigest } from "./messages";
import { deliverPending, enqueue, listNotifications, MAX_ATTEMPTS, type Senders } from "./outbox";
import { emailSender, enabledChannels, telegramSender } from "./senders";
import { thresholdFor } from "./thresholds";

const at = (iso: string) => new Date(iso);
const bodies = (db: ReturnType<typeof testDb>) => db.select().from(notifications).all().map((n) => n.body);

async function world() {
  const db = testDb();
  const a = addCompany(db, "Akdeniz");
  const b = addCompany(db, "Boğaziçi");
  const admin = await addUser(db, "admin", "admin");
  const techA = await addUser(db, "tech-a", "technician", { companyIds: [a] });
  return { db, a, b, admin, techA };
}

describe("warning thresholds", () => {
  it("picks the tightest warning for the days left", () => {
    const cases: [number, number | null][] = [
      [31, null], [30, 30], [8, 30], [7, 7], [1, 7], [0, 0], [-1, 0], [-7, 0], [-8, null], [-400, null],
    ];
    for (const [days, expected] of cases) expect(thresholdFor(days), `${days} days`).toBe(expected);
  });
});

describe("expiry check", () => {
  it("raises each warning once as the date approaches: 30 days, 7 days, the day itself", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ name: "Sunucu", warrantyEnd: "2026-07-01" }));
    const check = (today: string) => runExpiryCheck(db, today, ["email"]).raised;

    expect(check("2026-05-31")).toBe(0); // 31 days left
    expect(check("2026-06-01")).toBe(1); // 30
    expect(check("2026-06-01")).toBe(0); // same day again
    expect(check("2026-06-15")).toBe(0); // still inside the 30-day warning
    expect(check("2026-06-24")).toBe(1); // 7
    expect(check("2026-06-30")).toBe(0);
    expect(check("2026-07-01")).toBe(1); // due
    expect(check("2026-07-05")).toBe(0);
    expect(check("2026-08-01")).toBe(0);

    expect(bodies(db)).toEqual([
      expect.stringContaining("• Garanti: Sunucu (D-0001) — 30 gün kaldı (1 Tem 2026)"),
      expect.stringContaining("7 gün kaldı"),
      expect.stringContaining("bugün bitiyor"),
    ]);
  });

  it("an item first seen close to its date gets only the warning that applies now", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ warrantyEnd: "2026-06-04" }));

    expect(runExpiryCheck(db, "2026-06-01", ["email"]).raised).toBe(1);
    expect(db.select().from(expiryNotices).all().map((n) => n.threshold)).toEqual([7]);
  });

  it("ignores retired devices, long-expired items, undated items and inactive companies", async () => {
    const { db, a, admin } = await world();
    const closed = addCompany(db, "Kapalı", false);
    createAsset(db, admin, a, assetInput({ name: "Hurda", status: "retired", warrantyEnd: "2026-06-05" }));
    createAsset(db, admin, a, assetInput({ name: "Çok Eski", warrantyEnd: "2020-01-01" }));
    createAsset(db, admin, a, assetInput({ name: "Tarihsiz" }));
    createAsset(db, admin, closed, assetInput({ name: "Kapalı Şirket PC", warrantyEnd: "2026-06-05" }));
    createLicense(db, admin, a, { name: "Süresiz", currency: "TRY" });

    expect(runExpiryCheck(db, "2026-06-01", ["email"]).raised).toBe(0);
    expect(bodies(db)).toEqual([]);
  });

  it("sends one digest per channel, grouped by company, soonest first", async () => {
    const { db, a, b, admin } = await world();
    createAsset(db, admin, a, assetInput({ name: "Yazıcı", warrantyEnd: "2026-06-20" }));
    createLicense(db, admin, a, { name: "Antivirüs", currency: "TRY", expiryDate: "2026-05-30" });
    createLicense(db, admin, b, { name: "CAD", currency: "TRY", expiryDate: "2026-06-01" });

    expect(runExpiryCheck(db, "2026-06-01", ["email", "telegram"], at("2026-06-01T09:00:00Z")).raised).toBe(3);

    const queued = db.select().from(notifications).all();
    expect(queued.map((n) => [n.channel, n.status])).toEqual([["email", "pending"], ["telegram", "pending"]]);
    expect(queued[0].subject).toBe("ITYS: 3 kayıt için bitiş uyarısı");
    expect(queued[0].body).toBe(
      [
        "Garanti ya da lisans süresi yaklaşan veya dolan kayıtlar:",
        "Akdeniz\n• Lisans: Antivirüs — 2 gün önce bitti (30 May 2026)\n• Garanti: Yazıcı (D-0001) — 19 gün kaldı (20 Haz 2026)",
        "Boğaziçi\n• Lisans: CAD — bugün bitiyor (1 Haz 2026)",
      ].join("\n\n"),
    );
    expect(queued[1].body).toBe(queued[0].body);
  });

  it("renewing re-arms the warnings for the new date", async () => {
    const { db, a, admin } = await world();
    const license = createLicense(db, admin, a, { name: "M365", currency: "TRY", expiryDate: "2026-06-05" });
    const asset = createAsset(db, admin, a, assetInput({ warrantyEnd: "2026-06-05" }));
    expect(runExpiryCheck(db, "2026-06-01", ["email"]).raised).toBe(2);

    updateLicense(db, admin, license.id, { name: "M365", currency: "TRY", expiryDate: "2027-06-05" });
    updateAsset(db, admin, asset.id, assetInput({ warrantyEnd: "2027-06-05" }));
    expect(runExpiryCheck(db, "2026-06-02", ["email"]).raised).toBe(0);
    expect(runExpiryCheck(db, "2027-05-06", ["email"]).raised).toBe(2);
  });

  it("records nothing while no channel is on, so switching one on reports what is current", async () => {
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ warrantyEnd: "2026-06-05" }));

    expect(runExpiryCheck(db, "2026-06-01", []).raised).toBe(0);
    expect(db.select().from(expiryNotices).all()).toEqual([]);
    expect(runExpiryCheck(db, "2026-06-02", ["telegram"]).raised).toBe(1);
  });

  it("the dashboard list is per company and respects access", async () => {
    const { db, a, b, admin, techA } = await world();
    createAsset(db, admin, a, assetInput({ name: "A-PC", warrantyEnd: "2026-06-10" }));
    createLicense(db, admin, a, { name: "A-Lisans", currency: "TRY", expiryDate: "2026-06-03" });
    createAsset(db, admin, b, assetInput({ name: "B-PC", warrantyEnd: "2026-06-10" }));

    expect(upcomingExpiries(db, techA, a, "2026-06-01").map((i) => [i.label, i.daysLeft])).toEqual([
      ["A-Lisans", 2],
      ["A-PC (D-0001)", 9],
    ]);
    expect(() => upcomingExpiries(db, techA, b, "2026-06-01")).toThrow("notFound");
  });
});

describe("outbox delivery", () => {
  const message = { subject: "Konu", body: "Metin" };
  const T0 = at("2026-06-01T09:00:00Z");
  const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

  it("sends pending messages through their channel and marks them sent", async () => {
    const db = testDb();
    enqueue(db, "email", message, T0);
    enqueue(db, "telegram", message, T0);
    const seen: string[] = [];
    const senders: Senders = { email: async (m) => void seen.push(`email:${m.subject}`), telegram: async () => void seen.push("telegram") };

    expect(await deliverPending(db, senders, T0)).toEqual({ sent: 2, failed: 0 });
    expect(seen).toEqual(["email:Konu", "telegram"]);
    expect(await deliverPending(db, senders, later(60))).toEqual({ sent: 0, failed: 0 });
    expect(db.select().from(notifications).all().every((n) => n.status === "sent" && n.attempts === 1)).toBe(true);
  });

  it("retries after 5, 10, 20 and 40 minutes, then gives up after the fifth failure", async () => {
    const db = testDb();
    enqueue(db, "email", message, T0);
    let calls = 0;
    const senders: Senders = { email: async () => { calls++; throw new Error("connect ECONNREFUSED"); } };
    const state = () => db.select().from(notifications).get()!;

    await deliverPending(db, senders, T0);
    expect(state()).toMatchObject({ status: "pending", attempts: 1, lastError: "connect ECONNREFUSED" });

    await deliverPending(db, senders, later(4)); // not due yet
    expect(calls).toBe(1);

    for (const minute of [5, 15, 35, 75]) await deliverPending(db, senders, later(minute));
    expect(calls).toBe(MAX_ATTEMPTS);
    expect(state()).toMatchObject({ status: "failed", attempts: 5 });

    await deliverPending(db, senders, later(10_000));
    expect(calls).toBe(MAX_ATTEMPTS);
  });

  it("a message for a channel that was switched off fails instead of vanishing; a later success recovers", async () => {
    const db = testDb();
    enqueue(db, "telegram", message, T0);

    expect(await deliverPending(db, {}, T0)).toEqual({ sent: 0, failed: 1 });
    expect(await deliverPending(db, { telegram: async () => {} }, later(5))).toEqual({ sent: 1, failed: 0 });
    expect(db.select().from(notifications).get()).toMatchObject({ status: "sent", attempts: 2, lastError: null });
  });

  it("history is for admins only", async () => {
    const { db, admin, techA } = await world();
    enqueue(db, "email", message, T0);
    expect(listNotifications(db, admin)).toHaveLength(1);
    expect(() => listNotifications(db, techA)).toThrow("forbidden");
  });
});

describe("notification settings", () => {
  const input = (overrides: Partial<NotificationSettingsInput> = {}): NotificationSettingsInput => ({
    emailEnabled: true,
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "bildirim",
    smtpPassword: "smtp-secret-1",
    smtpFrom: "itys@example.com",
    emailTo: ["it@example.com"],
    telegramEnabled: true,
    telegramToken: "123456:TOKEN-SECRET",
    telegramChatId: "-100123",
    ...overrides,
  });

  it("stores secrets encrypted, never returns them, and decrypts them only for delivery", async () => {
    const { db, admin } = await world();
    saveNotificationSettings(db, admin, input());

    const raw = JSON.stringify(db.select().from(settings).all());
    expect(raw).not.toContain("smtp-secret-1");
    expect(raw).not.toContain("TOKEN-SECRET");

    const shown = getNotificationSettings(db, admin);
    expect(JSON.stringify(shown)).not.toMatch(/secret/i);
    expect(shown).toMatchObject({ hasSmtpPassword: true, hasTelegramToken: true, smtpHost: "smtp.example.com", emailTo: ["it@example.com"] });

    expect(loadDeliveryConfig(db)).toMatchObject({ smtpPassword: "smtp-secret-1", telegramToken: "123456:TOKEN-SECRET" });
  });

  it("empty secret fields keep what is stored; clearing the SMTP user drops its password", async () => {
    const { db, admin } = await world();
    saveNotificationSettings(db, admin, input());

    saveNotificationSettings(db, admin, input({ smtpPassword: "", telegramToken: "", smtpHost: "mail.example.com" }));
    expect(loadDeliveryConfig(db)).toMatchObject({ smtpHost: "mail.example.com", smtpPassword: "smtp-secret-1", telegramToken: "123456:TOKEN-SECRET" });

    saveNotificationSettings(db, admin, input({ smtpUser: "", smtpPassword: "" }));
    expect(loadDeliveryConfig(db).smtpPassword).toBeNull();
  });

  it("Telegram cannot be switched on without a token", async () => {
    const { db, admin } = await world();
    expect(() => saveNotificationSettings(db, admin, input({ telegramToken: "" }))).toThrow("telegramTokenMissing");
  });

  it("is admin only, and starts with everything off", async () => {
    const { db, admin, techA } = await world();
    expect(() => getNotificationSettings(db, techA)).toThrow("forbidden");
    expect(() => saveNotificationSettings(db, techA, input())).toThrow("forbidden");
    expect(getNotificationSettings(db, admin)).toMatchObject({ emailEnabled: false, telegramEnabled: false, smtpPort: 587 });
    expect(enabledChannels(loadDeliveryConfig(db))).toEqual([]);
  });

  it("validates only the channels that are switched on", () => {
    const form = {
      emailEnabled: false, smtpHost: "", smtpPort: "587", smtpSecure: false, smtpUser: "", smtpFrom: "", emailTo: "",
      telegramEnabled: false, telegramChatId: "",
    };
    expect(notificationSettingsInput.safeParse(form).success).toBe(true);

    const email = notificationSettingsInput.safeParse({ ...form, emailEnabled: true });
    expect(!email.success && email.error.issues.map((i) => i.path[0]).sort()).toEqual(["emailTo", "smtpFrom", "smtpHost"]);

    const ok = notificationSettingsInput.parse({
      ...form, emailEnabled: true, smtpHost: "smtp.example.com", smtpFrom: "a@example.com", emailTo: "x@example.com, y@example.com;z@example.com",
    });
    expect(ok.emailTo).toEqual(["x@example.com", "y@example.com", "z@example.com"]);

    expect(notificationSettingsInput.safeParse({ ...form, emailEnabled: true, smtpHost: "h", smtpFrom: "a@example.com", emailTo: "not-an-email" }).success).toBe(false);
    expect(notificationSettingsInput.safeParse({ ...form, smtpPort: "70000" }).success).toBe(false);
    expect(notificationSettingsInput.safeParse({ ...form, telegramEnabled: true, telegramChatId: "abc" }).success).toBe(false);
    expect(notificationSettingsInput.safeParse({ ...form, telegramEnabled: true, telegramChatId: "@kanal" }).success).toBe(true);
  });
});

describe("senders", () => {
  const config = {
    emailEnabled: true, smtpHost: "smtp.example.com", smtpPort: 465, smtpSecure: true, smtpUser: "u", smtpPassword: "p",
    smtpFrom: "itys@example.com", emailTo: ["a@example.com", "b@example.com"],
    telegramEnabled: true, telegramToken: "123:TOKEN", telegramChatId: "-100123",
  };
  const message = buildDigest([
    { kind: "license", refId: 1, companyName: "Akdeniz", label: "M365", dueDate: "2026-06-08", daysLeft: 7 },
  ]);

  it("email goes to every recipient with the configured server and credentials", async () => {
    const sent: unknown[] = [];
    const options: unknown[] = [];
    const transport = ((o: unknown) => {
      options.push(o);
      return { sendMail: async (mail: unknown) => void sent.push(mail) };
    }) as never;

    await emailSender(config, transport)(message);

    expect(options[0]).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, auth: { user: "u", pass: "p" } });
    expect(sent[0]).toEqual({
      from: "itys@example.com",
      to: ["a@example.com", "b@example.com"],
      subject: "ITYS: 1 kayıt için bitiş uyarısı",
      text: expect.stringContaining("• Lisans: M365 — 7 gün kaldı (8 Haz 2026)"),
    });
  });

  it("email without a user name sends no credentials", async () => {
    const options: { auth?: unknown }[] = [];
    const transport = ((o: { auth?: unknown }) => (options.push(o), { sendMail: async () => {} })) as never;
    await emailSender({ ...config, smtpUser: "", smtpPassword: null }, transport)(message);
    expect(options[0].auth).toBeUndefined();
  });

  it("telegram posts the text to the bot API", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as never;

    await telegramSender(config, fetchFn)(message);

    expect(calls[0].url).toBe("https://api.telegram.org/bot123:TOKEN/sendMessage");
    expect(calls[0].body).toEqual({ chat_id: "-100123", text: expect.stringContaining("ITYS: 1 kayıt için bitiş uyarısı\n\nGaranti ya da") });
  });

  it("a Telegram error reports the reason without leaking the token", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 })) as never;
    const error = await telegramSender(config, fetchFn)(message).catch((e: Error) => e);
    expect((error as Error).message).toBe("Telegram 400: chat not found");
    expect((error as Error).message).not.toContain("TOKEN");
  });

  it("only switched-on, fully configured channels are used", () => {
    expect(enabledChannels(config)).toEqual(["email", "telegram"]);
    expect(enabledChannels({ ...config, emailEnabled: false })).toEqual(["telegram"]);
    expect(enabledChannels({ ...config, telegramToken: null })).toEqual(["email"]);
  });
});

describe("scheduler tick", () => {
  it("raises warnings only in the daytime unless forced, but always delivers", async () => {
    const { tick } = await import("./scheduler");
    const { db, a, admin } = await world();
    createAsset(db, admin, a, assetInput({ warrantyEnd: "2026-06-05" }));
    // Email is on but nothing listens on this port, so delivery fails fast.
    saveNotificationSettings(db, admin, {
      emailEnabled: true, smtpHost: "127.0.0.1", smtpPort: 1, smtpSecure: false, smtpUser: "", smtpFrom: "itys@example.com",
      emailTo: ["it@example.com"], telegramEnabled: false, telegramChatId: "",
    });

    expect(await tick(db, new Date(2026, 5, 1, 3, 0))).toEqual({ raised: 0, sent: 0, failed: 0 });
    expect(await tick(db, new Date(2026, 5, 1, 20, 0))).toEqual({ raised: 0, sent: 0, failed: 0 });
    expect(await tick(db, new Date(2026, 5, 1, 9, 0))).toEqual({ raised: 1, sent: 0, failed: 1 });
    expect(await tick(db, new Date(2026, 5, 1, 9, 1), true)).toEqual({ raised: 0, sent: 0, failed: 0 });
    expect(db.select().from(notifications).get()).toMatchObject({ status: "pending", attempts: 1 });
  });
});
