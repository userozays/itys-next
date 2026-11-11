import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, signIn, TECH } from "./helpers";

// A stand-in for the Telegram Bot API; the app is pointed at it by TELEGRAM_API_URL.
test.describe.configure({ mode: "serial" });

type Received = { path: string; chat_id: string; text: string };
const received: Received[] = [];
let failNext = false;
let telegram: Server;

test.beforeAll(async () => {
  telegram = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (failNext) {
        failNext = false;
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, description: "chat not found" }));
      }
      received.push({ path: req.url ?? "", ...JSON.parse(body) });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => telegram.listen(3199, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => telegram.close(resolve));
});

async function openNotifications(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await page.getByRole("link", { name: "Bildirimler" }).click();
  await expect(page.getByRole("heading", { name: "Bildirimler" })).toBeVisible();
}

const inDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test("technicians have no notifications screen", async ({ page }) => {
  await signIn(page, TECH);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bildirimler" })).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page).toHaveURL(/\/$/);
});

test("nothing can be sent before a channel is switched on", async ({ page }) => {
  await openNotifications(page);
  await expect(page.getByText("Henüz bildirim gönderilmedi.")).toBeVisible();
  await page.getByRole("button", { name: "Test bildirimi gönder" }).click();
  await expect(page.getByText("Önce e-posta ya da Telegram bildirimini açıp kaydet.")).toBeVisible();
});

test("settings are validated, saved, and the token is not shown again", async ({ page }) => {
  await openNotifications(page);
  await page.getByLabel("Telegram ile bildir").check();
  await page.getByLabel("Sohbet kimliği").fill("-100123456");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Telegram'ı açmak için bot anahtarı gir.")).toBeVisible();

  await page.getByLabel("E-posta ile bildir").check();
  await page.getByLabel("Bot anahtarı").fill("123456:E2E-BOT-TOKEN");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Bu alan zorunlu.")).toHaveCount(2); // SMTP server and recipients
  await expect(page.getByText("Geçerli bir e-posta adresi gir.")).toBeVisible(); // from address

  await page.getByLabel("E-posta ile bildir").uncheck();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Telegram ile bildir")).toBeChecked();
  await expect(page.getByLabel("Sohbet kimliği")).toHaveValue("-100123456");
  await expect(page.getByLabel("Bot anahtarı")).toHaveValue("");
  await expect(page.getByText("Kayıtlı bir anahtar var; değiştirmek için yenisini yaz.")).toBeVisible();
  expect(await page.content()).not.toContain("E2E-BOT-TOKEN");
});

test("a test notification reaches Telegram and shows in the history", async ({ page }) => {
  await openNotifications(page);
  await page.getByRole("button", { name: "Test bildirimi gönder" }).click();
  await expect(page.getByText("1 bildirim gönderildi.")).toBeVisible();

  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ path: "/bot123456:E2E-BOT-TOKEN/sendMessage", chat_id: "-100123456" });
  expect(received[0].text).toContain("ITYS: test bildirimi");

  const row = page.locator("tbody tr").first();
  await expect(row).toContainText("Telegram");
  await expect(row).toContainText("ITYS: test bildirimi");
  await expect(row).toContainText("Gönderildi");
});

test("a warranty ending in 5 days is reported once", async ({ page }) => {
  await openNotifications(page);
  await page.goto("/assets/new");
  await page.getByLabel("Cihaz adı").fill("Garantisi Biten PC");
  await page.getByLabel("Garanti bitişi").fill(inDays(5));
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Garantisi Biten PC" })).toBeVisible();
  await expect(page.getByText("Garanti bitiyor")).toBeVisible();

  await page.goto("/notifications");
  await page.getByRole("button", { name: "Şimdi kontrol et" }).click();
  await expect(page.getByText("1 kayıt için uyarı oluşturuldu; 1 bildirim gönderildi.")).toBeVisible();

  expect(received).toHaveLength(2);
  expect(received[1].text).toContain("ITYS: 1 kayıt için bitiş uyarısı");
  expect(received[1].text).toContain("Akdeniz Lojistik\n• Garanti: Garantisi Biten PC (");
  expect(received[1].text).toContain("— 5 gün kaldı (");
  // Devices whose warranty ended long ago (from earlier specs) are not reported.
  expect(received[1].text).not.toContain("Muhasebe PC");

  await page.getByRole("button", { name: "Şimdi kontrol et" }).click();
  await expect(page.getByText("Yeni uyarı yok; gönderilen yok.")).toBeVisible();
  expect(received).toHaveLength(2);
});

test("the dashboard lists what is about to expire", async ({ page }) => {
  await signIn(page, ADMIN);
  const card = page.getByText("Yaklaşan ve yeni dolan süreler").locator("xpath=ancestor::*[@data-slot='card']");
  await expect(card.getByRole("link", { name: /Garantisi Biten PC/ })).toBeVisible();
  await expect(card.getByText("5 gün kaldı")).toBeVisible();
  await card.getByRole("link", { name: /Garantisi Biten PC/ }).click();
  await expect(page.getByRole("heading", { name: "Garantisi Biten PC" })).toBeVisible();
});

test("a failed delivery is kept for retry with its reason", async ({ page }) => {
  await openNotifications(page);
  failNext = true;
  await page.getByRole("button", { name: "Test bildirimi gönder" }).click();
  await expect(page.getByText("Hiçbiri gönderilemedi, 1 tanesi başarısız.")).toBeVisible();

  const row = page.locator("tbody tr").first();
  await expect(row).toContainText("Bekliyor");
  await expect(row).toContainText("Telegram 400: chat not found");
  expect(await page.content()).not.toContain("E2E-BOT-TOKEN");
  expect(received).toHaveLength(2);
});
