import { expect, test, type Page } from "@playwright/test";
import { ADMIN, choose, optionsOf, signIn, signOut, switchCompany, TECH } from "./helpers";

// Builds on 02: Akdeniz Lojistik has "Muhasebe PC" (D-0001); Boğaziçi Tekstil has "Gizli Sunucu".
test.describe.configure({ mode: "serial" });

const KEY = "M365X-TEST1-KEY22-ABCDE";
let hiddenLicensePath = "";

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

async function openLicense(page: Page, name: string) {
  await page.goto("/licenses");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("admin adds a license; bad seats and cost are rejected first", async ({ page }) => {
  await signInAdmin(page);
  await page.getByRole("link", { name: "Lisanslar", exact: true }).click();
  await expect(page.getByText("Bu şirkette henüz lisans yok.")).toBeVisible();
  await page.getByRole("link", { name: "Yeni lisans" }).click();

  await page.getByLabel("Yazılım").fill("Microsoft 365");
  await page.getByLabel("Üretici").fill("Microsoft");
  await page.getByLabel("Koltuk sayısı").fill("0");
  await page.getByLabel("Maliyet").fill("12,345");
  await page.getByLabel("Lisans anahtarı").fill(KEY);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("1 ile 100.000 arasında tam sayı gir ya da boş bırak.")).toBeVisible();
  await expect(page.getByText("Geçerli bir tutar gir (ör. 1250,50).")).toBeVisible();

  await page.getByLabel("Koltuk sayısı").fill("1");
  await page.getByLabel("Maliyet").fill("1.250,50");
  await page.getByLabel("Bitiş tarihi").fill("2020-03-01");
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page).toHaveURL(/\/licenses\/\d+$/);
  await expect(page.getByRole("heading", { name: "Microsoft 365" })).toBeVisible();
  await expect(page.getByText("Süresi doldu")).toBeVisible();
  await expect(page.getByText("₺1.250,50")).toBeVisible();
  await expect(page.getByText("0 / 1")).toBeVisible();
});

test("the key is not on the page until it is asked for", async ({ page }) => {
  await signInAdmin(page);
  await openLicense(page, "Microsoft 365");

  expect(await page.content()).not.toContain(KEY);
  await page.getByRole("button", { name: "Anahtarı göster" }).click();
  await expect(page.getByTestId("license-key")).toHaveText(KEY);

  await page.getByRole("button", { name: "Gizle" }).click();
  await expect(page.getByTestId("license-key")).toHaveCount(0);
});

test("a license is assigned to a device until its seats run out", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByLabel("Cihaz adı").fill("Satış Dizüstü");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Satış Dizüstü" })).toBeVisible();

  await openLicense(page, "Microsoft 365");
  await choose(page, "Cihaza ata", "Muhasebe PC (D-0001)");
  await page.getByRole("button", { name: "Ata", exact: true }).click();
  await expect(page.getByText("1 / 1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Muhasebe PC/ })).toBeVisible();

  await page.getByRole("button", { name: "Ata", exact: true }).click();
  await expect(page.getByText("Bu lisansta boş koltuk yok.")).toBeVisible();

  await page.getByRole("link", { name: /Muhasebe PC/ }).click();
  await expect(page.getByRole("heading", { name: "Muhasebe PC" })).toBeVisible();
  await expect(page.getByText("Bu cihazdaki lisanslar")).toBeVisible();
  await expect(page.getByRole("link", { name: "Microsoft 365" })).toBeVisible();
});

test("editing without retyping the key keeps it; seats cannot drop below usage", async ({ page }) => {
  await signInAdmin(page);
  await openLicense(page, "Microsoft 365");
  await page.getByRole("link", { name: "Düzenle" }).click();
  await expect(page.getByLabel("Lisans anahtarı")).toHaveValue("");
  await expect(page.getByLabel("Maliyet")).toHaveValue("1250,50");

  await page.getByLabel("Koltuk sayısı").fill("");
  await page.getByLabel("Bitiş tarihi").fill("");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/licenses\/\d+$/);
  await expect(page.getByText("Sınırsız")).toBeVisible();
  await expect(page.getByText("Süresiz")).toBeVisible();
  await page.getByRole("button", { name: "Anahtarı göster" }).click();
  await expect(page.getByTestId("license-key")).toHaveText(KEY);

  await page.getByRole("button", { name: "Ata", exact: true }).click();
  await expect(page.getByText("2 cihaz")).toBeVisible();

  await page.getByRole("link", { name: "Düzenle" }).click();
  await page.getByLabel("Koltuk sayısı").fill("1");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Koltuk sayısı, atanmış cihaz sayısından az olamaz.")).toBeVisible();
});

test("removing an assignment frees the seat", async ({ page }) => {
  await signInAdmin(page);
  await openLicense(page, "Microsoft 365");
  await page.getByRole("button", { name: "Atamayı kaldır: Satış Dizüstü" }).click();
  await expect(page.getByText("1 cihaz")).toBeVisible();
  // D-0002 belonged to a device deleted in 02; its number is not given out again.
  expect(await optionsOf(page, "Cihaza ata")).toEqual(["Satış Dizüstü (D-0003)"]);
});

test("admin adds a license in the other company", async ({ page }) => {
  await signInAdmin(page);
  await switchCompany(page, "Boğaziçi Tekstil");
  await expect(page.getByRole("main").getByText("Boğaziçi Tekstil")).toBeVisible();
  await page.goto("/licenses");
  await expect(page.getByText("Bu şirkette henüz lisans yok.")).toBeVisible();

  await page.getByRole("link", { name: "Yeni lisans" }).click();
  await page.getByLabel("Yazılım").fill("Gizli CAD");
  await page.getByLabel("Lisans anahtarı").fill("SECRET-OTHER-COMPANY");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Gizli CAD" })).toBeVisible();
  expect(await optionsOf(page, "Cihaza ata")).toEqual(["Gizli Sunucu (D-0001)"]);
  hiddenLicensePath = new URL(page.url()).pathname;
  await signOut(page);
});

test("a technician works with own company's licenses but cannot reach the other company's", async ({ page }) => {
  await signIn(page, TECH);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();

  await page.goto("/licenses");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("Gizli CAD")).toHaveCount(0);

  await page.getByRole("link", { name: "Microsoft 365" }).click();
  await page.getByRole("button", { name: "Anahtarı göster" }).click();
  await expect(page.getByTestId("license-key")).toHaveText(KEY);
  await expect(page.getByRole("button", { name: "Sil" })).toHaveCount(0);

  expect((await page.goto(hiddenLicensePath))?.status()).toBe(404);
  expect((await page.goto(`${hiddenLicensePath}/edit`))?.status()).toBe(404);
  expect(await page.content()).not.toContain("SECRET-OTHER-COMPANY");
});

test("admin deletes a license after confirming", async ({ page }) => {
  await signInAdmin(page);
  await openLicense(page, "Microsoft 365");
  await page.getByRole("button", { name: "Sil" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();

  await expect(page).toHaveURL(/\/licenses$/);
  await expect(page.getByText("Bu şirkette henüz lisans yok.")).toBeVisible();
  await page.goto("/assets");
  await page.getByRole("link", { name: "Muhasebe PC" }).click();
  await expect(page.getByText("Bu cihaza atanmış lisans yok.")).toBeVisible();
});
