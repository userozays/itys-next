import { expect, test, type Page } from "@playwright/test";
import { ADMIN, choose, companySwitcher, signIn, TECH } from "./helpers";

// Builds on 03: Akdeniz Lojistik has "Muhasebe PC" (D-0001) and "Satış Dizüstü" (D-0003).
test.describe.configure({ mode: "serial" });

let akdenizId = "";
let bogaziciId = "";

const CSV = [
  "Demirbaş Adı;Tür;Konum;Garanti Bitişi;Etiket No",
  "Toplantı Odası PC;Masaüstü;Toplantı Odası;31.01.2027;",
  "Omurga Switch;Switch;Sistem Odası;;SW-01",
  "Bozuk Tür;uzay gemisi;;;",
  "Çakışan Etiket;;;;D-0001",
  "Resepsiyon Yazıcısı;Yazıcı;Merkez Ofis;15/06/2026;",
].join("\n");

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

test("the sample template downloads for signed-in users", async ({ page }) => {
  await signInAdmin(page);
  const response = await page.request.get("/assets/import/template");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("cihaz-sablonu.csv");
  expect(await response.text()).toContain("Cihaz Adı;Tür;Durum");
});

test("an unsupported file is refused with a clear message", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/import");
  await page.getByLabel("Dosya").setInputFiles({ name: "cihazlar.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Yükle ve önizle" }).click();
  await expect(page.getByText("Yalnızca .xlsx ve .csv dosyaları desteklenir.")).toBeVisible();
});

test("a CSV is uploaded, mapped, previewed and imported", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets");
  await page.getByRole("link", { name: "İçe aktar" }).click();
  await page.getByLabel("Dosya").setInputFiles({ name: "cihazlar.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await page.getByRole("button", { name: "Yükle ve önizle" }).click();

  await expect(page).toHaveURL(/\/assets\/import\/\d+$/);
  // "Demirbaş Adı" is not a header the guesser knows, so the name is unmapped at first.
  await expect(page.getByText("Devam etmek için cihaz adı sütununu eşleştir.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Tür", exact: true })).toContainText("Tür");
  await expect(page.getByRole("combobox", { name: "Etiket no", exact: true })).toContainText("Etiket No");
  await expect(page.getByRole("combobox", { name: "Cihaz adı", exact: true })).toContainText("eşleştirme yok");

  await choose(page, "Cihaz adı", "Demirbaş Adı");
  await page.getByRole("button", { name: "Önizlemeyi güncelle" }).click();

  await expect(page.getByRole("button", { name: "3 cihazı içe aktar" })).toBeVisible();
  await expect(page.getByText("Oluşturulacak konumlar: Toplantı Odası, Sistem Odası")).toBeVisible();
  await expect(page.getByText("Tür — tanınmayan tür")).toBeVisible();
  await expect(page.getByText("Etiket no — bu etiket şirkette zaten var")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Toplantı Odası PC" })).toBeVisible();

  await page.getByRole("button", { name: "3 cihazı içe aktar" }).click();
  await expect(page.getByRole("heading", { name: "İçe aktarma tamamlandı" })).toBeVisible();
  await expect(page.getByText("3 cihaz eklendi, 2 satır atlandı.")).toBeVisible();
  await expect(page.getByText("Satır 4:")).toBeVisible();

  await page.getByRole("link", { name: "Cihaz listesine git" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("link", { name: "Omurga Switch" }).click();
  await expect(page.getByText("SW-01").first()).toBeVisible();
  await expect(page.getByText("Ağ cihazı").first()).toBeVisible();
  await expect(page.getByText("Sistem Odası")).toBeVisible();
  await expect(page.getByText("İçe aktarma", { exact: true })).toBeVisible();

  await page.goto("/locations");
  await expect(page.getByRole("cell", { name: "Toplantı Odası", exact: true })).toBeVisible();
});

test("a finished import cannot be run again", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/import/1");
  await expect(page.getByRole("heading", { name: "İçe aktarma tamamlandı" })).toBeVisible();
  await expect(page.getByRole("button", { name: /içe aktar/ })).toHaveCount(0);
});

test("labels print for the filtered list and for a single device", async ({ page }) => {
  await signInAdmin(page);
  akdenizId = (await companySwitcher(page).getAttribute("data-company-id")) ?? "";
  await companySwitcher(page).click();
  bogaziciId = (await page.getByRole("option", { name: "Boğaziçi Tekstil" }).getAttribute("data-company-id")) ?? "";
  await page.keyboard.press("Escape");
  expect(akdenizId).toMatch(/^\d+$/);
  expect(bogaziciId).toMatch(/^\d+$/);

  await page.goto("/assets");
  await page.getByRole("link", { name: "Etiket yazdır" }).click();
  await expect(page.getByRole("img", { name: /^QR / })).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Yazdır" })).toBeVisible();

  await page.goto("/assets?type=printer");
  await page.getByRole("link", { name: "Etiket yazdır" }).click();
  await expect(page.getByRole("img", { name: /^QR / })).toHaveCount(1);
  await expect(page.getByText("Resepsiyon Yazıcısı")).toBeVisible();

  await page.goto("/assets");
  await page.getByRole("link", { name: "Muhasebe PC" }).click();
  await expect(page.getByRole("img", { name: "QR D-0001" })).toBeVisible();
  await page.getByRole("link", { name: "Etiket yazdır" }).click();
  await expect(page.getByRole("img", { name: /^QR / })).toHaveCount(1);
});

test("the address in a QR code opens the device", async ({ page }) => {
  await signInAdmin(page);
  await page.goto(`/a/${akdenizId}/SW-01`);
  await expect(page).toHaveURL(/\/assets\/\d+$/);
  await expect(page.getByRole("heading", { name: "Omurga Switch" })).toBeVisible();

  expect((await page.goto(`/a/${akdenizId}/NO-SUCH-TAG`))?.status()).toBe(404);
});

test("scanning while signed out asks for sign-in, then opens the device", async ({ page }) => {
  await page.goto(`/a/${akdenizId}/D-0001`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Kullanıcı adı").fill(TECH.username);
  await page.getByLabel("Parola").fill(TECH.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  await expect(page).toHaveURL(/\/assets\/\d+$/);
  await expect(page.getByRole("heading", { name: "Muhasebe PC" })).toBeVisible();

  // The technician is not assigned to the other company: its labels lead nowhere.
  expect((await page.goto(`/a/${bogaziciId}/D-0001`))?.status()).toBe(404);
});

test("sign-in never redirects to another site", async ({ page }) => {
  await page.goto("/login?next=//evil.example.com/steal");
  await page.getByLabel("Kullanıcı adı").fill(ADMIN.username);
  await page.getByLabel("Parola").fill(ADMIN.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://localhost:3100");
});
