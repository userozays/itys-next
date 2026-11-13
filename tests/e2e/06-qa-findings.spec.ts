import { expect, test, type Page } from "@playwright/test";
import { ADMIN, companySwitcher, signIn, switchCompany } from "./helpers";

// Builds on 01–05: Akdeniz Lojistik has "Muhasebe PC" (D-0001), "Toplantı Odası PC",
// the location "Merkez Ofis" and "Garantisi Biten PC"; Boğaziçi Tekstil has "Gizli Sunucu".
test.describe.configure({ mode: "serial" });

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

test("every problem in the device form is shown at once (QA O4, O5, O7)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByLabel("Cihaz adı").fill("Hatalı Cihaz");
  await page.getByLabel("Etiket no").fill("d-0001");
  await page.getByLabel("RAM (GB)").fill("çok");
  await page.getByLabel("IP adresi").fill("999.1.1.1");
  await page.getByLabel("MAC adresi").fill("zz:zz");
  await page.getByLabel("Alım tarihi").fill("2026-05-01");
  await page.getByLabel("Garanti bitişi").fill("2025-01-01");
  await page.getByRole("button", { name: "Kaydet" }).click();

  for (const message of [
    "Bu etiket no zaten Muhasebe PC cihazında kullanılıyor.",
    "GB cinsinden tam sayı gir (ör. 16).",
    "Geçerli bir IP adresi gir (ör. 192.168.1.20).",
    "Geçerli bir MAC adresi gir (ör. 00:1A:2B:3C:4D:5E).",
    "Garanti bitişi alım tarihinden önce olamaz.",
  ]) {
    await expect(page.getByText(message)).toBeVisible();
  }
  await expect(page).toHaveURL(/\/assets\/new$/);
});

test("a location name differing only in case is refused (QA O4)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/locations");
  await page.getByRole("button", { name: "Yeni konum" }).click();
  await page.getByLabel("Konum adı").fill("MERKEZ OFİS");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Bu adda bir konum zaten var.")).toBeVisible();
});

test("search ignores Turkish case and accents (QA O2)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets");
  await page.getByRole("searchbox", { name: "Ara" }).fill("TOPLANTI ODASI");
  await expect(page).toHaveURL(/q=TOPLANTI/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Toplantı Odası PC");
});

test("a record of another company says so and offers to switch (QA O8)", async ({ page }) => {
  await signInAdmin(page);
  await switchCompany(page, "Boğaziçi Tekstil");
  await page.goto("/assets");
  await page.getByRole("link", { name: "Gizli Sunucu" }).click();
  await expect(page.getByRole("heading", { name: "Gizli Sunucu" })).toBeVisible();
  // No notice while working in the record's own company.
  await expect(page.getByText("Bu kayıt Boğaziçi Tekstil şirketine ait.")).toHaveCount(0);
  const hidden = page.url();

  await switchCompany(page, "Akdeniz Lojistik");
  await page.goto(hidden);
  await expect(page.getByText("Bu kayıt Boğaziçi Tekstil şirketine ait.")).toBeVisible();
  await page.getByRole("button", { name: "Boğaziçi Tekstil şirketine geç" }).click();

  await expect(companySwitcher(page)).toContainText("Boğaziçi Tekstil");
  await expect(page.getByText("Bu kayıt Boğaziçi Tekstil şirketine ait.")).toHaveCount(0);
});

test("the dashboard leads to every warranty that ends soon (QA O9)", async ({ page }) => {
  await signInAdmin(page);
  await page.getByRole("link", { name: "Garantisi bitmek üzere olan cihazlar" }).click();
  await expect(page).toHaveURL(/\/assets\?warranty=soon$/);
  await expect(page.getByRole("combobox", { name: "Garanti", exact: true })).toContainText("Garanti bitiyor (30 gün)");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Garantisi Biten PC");

  await page.goto("/");
  await page.getByRole("link", { name: "Süresi dolan lisanslar" }).click();
  await expect(page).toHaveURL(/\/licenses\?expiry=expired$/);
  await expect(page.getByRole("combobox", { name: "Süre", exact: true })).toContainText("Süresi doldu");
});
