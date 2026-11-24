import { expect, test, type Page } from "@playwright/test";
import { ADMIN, choose, signIn, TECH } from "./helpers";

// Builds on 01–10: Akdeniz Lojistik has "Muhasebe PC", the "Merkez Ofis" location
// and the "Zoom Pro" license (500 TRY a month). tech.ayse may read license keys (01).
test.describe.configure({ mode: "serial" });

const VIEWER = { username: "izleyici.deniz", password: "kuzey-ruzgari-2026" };

async function signInAs(page: Page, user: { username: string; password: string }) {
  await signIn(page, user);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

async function openUserDialog(page: Page, username: string) {
  await page.goto("/users");
  await page.getByRole("button", { name: `Düzenle: ${username}` }).click();
  return page.getByRole("dialog");
}

test("an admin adds a read-only viewer; the key exception is only offered for technicians", async ({ page }) => {
  await signInAs(page, ADMIN);
  await page.goto("/users");
  await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Lisans anahtarlarını görebilir")).toBeVisible(); // technician is the default
  await dialog.getByLabel("Ad soyad").fill("Deniz Aksoy");
  await dialog.getByLabel("Kullanıcı adı").fill(VIEWER.username);
  await dialog.getByLabel("Parola", { exact: true }).fill(VIEWER.password);
  await choose(page, "Rol", "İzleyici");
  await expect(dialog.getByText(/Yalnızca görür ve dışa aktarır/)).toBeVisible();
  await expect(dialog.getByLabel("Lisans anahtarlarını görebilir")).toHaveCount(0);
  await dialog.getByLabel("Akdeniz Lojistik").check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: /izleyici\.deniz/ })).toContainText("İzleyici");

  // A key for Zoom Pro, for the checks below.
  await page.goto("/licenses");
  await page.getByRole("link", { name: "Zoom Pro" }).click();
  await page.getByRole("link", { name: "Düzenle" }).click();
  await page.getByLabel("Lisans anahtarı").fill("ZOOM-KEY-0001");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Zoom Pro" })).toBeVisible();
});

test("a viewer sees and exports, but changes nothing and sees no costs or keys", async ({ page }) => {
  await signInAs(page, VIEWER);
  await expect(page.getByText("Yıllık abonelik maliyeti")).toHaveCount(0);

  await page.goto("/assets");
  await expect(page.getByRole("button", { name: "Dışa aktar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Yeni cihaz" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "İçe aktar" })).toHaveCount(0);
  await page.getByRole("link", { name: /Muhasebe PC/ }).first().click();
  await expect(page.getByRole("heading", { name: "Muhasebe PC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(0);

  await page.goto("/assets/new");
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/locations");
  await expect(page.getByRole("link", { name: "Merkez Ofis", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yeni konum" })).toHaveCount(0);

  await page.goto("/licenses");
  await expect(page.getByRole("link", { name: "Yeni lisans" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Maliyet" })).toHaveCount(0);
  await page.getByRole("link", { name: "Zoom Pro" }).click();
  await expect(page.getByText("Anahtar kayıtlı. Görmek için yöneticiden yetki iste.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anahtarı göster" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ata", exact: true })).toHaveCount(0);
  await expect(page.getByText(/500,00/)).toHaveCount(0);
});

test("a technician assigns licenses but does not add them or see what they cost", async ({ page }) => {
  await signInAs(page, TECH);
  await expect(page.getByText("Koltuk kullanımı")).toBeVisible();
  await expect(page.getByText("Yıllık abonelik maliyeti")).toHaveCount(0);

  await page.goto("/licenses");
  await expect(page.getByRole("link", { name: "Yeni lisans" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Maliyet" })).toHaveCount(0);
  await page.getByRole("link", { name: "Zoom Pro" }).click();
  await expect(page.getByRole("button", { name: "Ata", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(0);
  await page.getByRole("button", { name: "Anahtarı göster" }).click();
  await expect(page.getByTestId("license-key")).toHaveText("ZOOM-KEY-0001");

  await page.goto("/licenses/new");
  await expect(page).toHaveURL(/\/$/);
});

test("without the exception a technician no longer sees license keys", async ({ page, browser }) => {
  await signInAs(page, ADMIN);
  const dialog = await openUserDialog(page, TECH.username);
  await dialog.getByLabel("Lisans anahtarlarını görebilir").uncheck();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  const tech = await browser.newPage();
  await signInAs(tech, TECH);
  await tech.goto("/licenses");
  await tech.getByRole("link", { name: "Zoom Pro" }).click();
  await expect(tech.getByText("Anahtar kayıtlı. Görmek için yöneticiden yetki iste.")).toBeVisible();
  await tech.close();
});
