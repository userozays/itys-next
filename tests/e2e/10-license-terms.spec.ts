import { expect, test, type Page } from "@playwright/test";
import { ADMIN, choose, signIn } from "./helpers";

// Builds on 01–09: Akdeniz Lojistik already has licenses (Microsoft 365 among them).
test.describe.configure({ mode: "serial" });

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

test("a monthly subscription and a perpetual license are entered with their own fields (QA Ö6)", async ({ page }) => {
  await signInAdmin(page);

  await page.goto("/licenses/new");
  await page.getByLabel("Yazılım").fill("Zoom Pro");
  await expect(page.getByRole("combobox", { name: "Lisans tipi", exact: true })).toContainText("Abonelik");
  await choose(page, "Yenileme periyodu", "Aylık");
  await page.getByLabel("Maliyet").fill("500");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Zoom Pro" })).toBeVisible();
  await expect(page.getByText("Abonelik · Aylık")).toBeVisible();
  await expect(page.getByText(/500,00.*\/ ay/)).toBeVisible();

  await page.goto("/licenses/new");
  await page.getByLabel("Yazılım").fill("Windows 11 Pro");
  await choose(page, "Lisans tipi", "Kalıcı lisans");
  await expect(page.getByRole("combobox", { name: "Yenileme periyodu" })).toHaveCount(0);
  await page.getByLabel("Alım tarihi").fill("2026-03-01");
  await page.getByLabel("Bitiş tarihi").fill("2026-01-01");
  await page.getByLabel("Maliyet").fill("3000");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Bitiş tarihi alım tarihinden önce olamaz.")).toBeVisible();

  await page.getByLabel("Bitiş tarihi").fill("");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Windows 11 Pro" })).toBeVisible();
  await expect(page.getByText("Kalıcı lisans", { exact: true })).toBeVisible();
});

test("the dashboard sums up seats and what licenses cost (QA Ö6)", async ({ page }) => {
  await signInAdmin(page);
  const card = page.locator("[data-slot=card]").filter({ hasText: "Lisans özeti" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Koltuk kullanımı")).toBeVisible();
  // Zoom Pro: 500 TRY a month → 6.000 TRY a year, on top of the earlier licenses.
  await expect(card.getByText("Yıllık abonelik maliyeti")).toBeVisible();
  await expect(card.getByText(/₺/).first()).toBeVisible();
  // Windows 11 Pro was bought once for 3.000 TRY.
  await expect(card.getByText(/3\.000,00/)).toBeVisible();
});
