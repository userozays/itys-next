import { expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { FAKE_CAMERA_TEXT } from "./fake-camera";

// A 1x1 white PNG: a "photo" with no code in it.
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
import { ADMIN, choose, companySwitcher, signIn, signOut, switchCompany, TECH } from "./helpers";

test.describe.configure({ mode: "serial" });

let hiddenAssetPath = "";

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

async function addDevice(page: Page, fields: { name: string; type?: string; brand?: string; tag?: string }) {
  await page.goto("/assets/new");
  await page.getByLabel("Cihaz adı").fill(fields.name);
  if (fields.tag) await page.getByLabel("Etiket no").fill(fields.tag);
  if (fields.type) await choose(page, "Tür", fields.type);
  if (fields.brand) await page.getByLabel("Marka").fill(fields.brand);
  await page.getByRole("button", { name: "Kaydet" }).click();
}

test("admin adds a location and a device that gets the next tag", async ({ page }) => {
  await signInAdmin(page);
  await expect(companySwitcher(page)).toContainText("Akdeniz Lojistik");
  await page.getByRole("link", { name: "Konumlar" }).click();
  await page.getByRole("button", { name: "Yeni konum" }).click();
  await page.getByLabel("Konum adı").fill("Merkez Ofis");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("cell", { name: "Merkez Ofis", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Donanım", exact: true }).click();
  await expect(page.getByText("Bu şirkette henüz cihaz yok.")).toBeVisible();
  await page.getByRole("link", { name: "Yeni cihaz" }).click();
  await page.getByLabel("Cihaz adı").fill("Muhasebe PC");
  await choose(page, "Tür", "Dizüstü");
  await page.getByLabel("Marka").fill("Lenovo");
  await choose(page, "Konum", "Merkez Ofis");
  await page.getByLabel("Zimmetli kişi").fill("Zeynep Arslan");
  await page.getByLabel("Garanti bitişi").fill("2020-01-15");
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page).toHaveURL(/\/assets\/\d+$/);
  await expect(page.getByRole("heading", { name: "Muhasebe PC" })).toBeVisible();
  await expect(page.getByText("D-0001").first()).toBeVisible();
  await expect(page.getByText("Garanti bitti")).toBeVisible();
  await expect(page.getByText("Merkez Ofis")).toBeVisible();
  await expect(page.getByText("15 Oca 2020")).toBeVisible();
});

test("a duplicate tag is rejected and the form keeps what was typed", async ({ page }) => {
  await signInAdmin(page);
  await addDevice(page, { name: "Kopya Cihaz", tag: "D-0001" });

  await expect(page.getByText("Bu etiket no zaten Muhasebe PC cihazında kullanılıyor.")).toBeVisible();
  await expect(page.getByLabel("Cihaz adı")).toHaveValue("Kopya Cihaz");
  await expect(page).toHaveURL(/\/assets\/new$/);
});

test("the list can be searched, filtered and sorted", async ({ page }) => {
  await signInAdmin(page);
  await addDevice(page, { name: "Depo Yazıcısı", type: "Yazıcı", brand: "HP" });
  await expect(page.getByText("D-0002").first()).toBeVisible();

  await page.goto("/assets");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("2 cihaz")).toBeVisible();

  // Filters apply by themselves: no button to press.
  await page.getByRole("searchbox", { name: "Ara" }).fill("lenovo");
  await expect(page).toHaveURL(/q=lenovo/);
  await expect(page.getByRole("searchbox", { name: "Ara" })).toBeFocused(); // typing is not interrupted
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Muhasebe PC");

  await page.getByRole("button", { name: "Temizle" }).click();
  await expect(rows).toHaveCount(2);
  await choose(page, "Tür", "Yazıcı");
  await expect(page).toHaveURL(/type=printer/);
  await expect(page.getByRole("button", { name: "Filtrele" })).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Depo Yazıcısı");

  // Opening a device and coming back keeps the filter.
  await page.getByRole("link", { name: "Depo Yazıcısı" }).click();
  await expect(page.getByRole("heading", { name: "Depo Yazıcısı" })).toBeVisible();
  await page.getByRole("link", { name: "← Donanım" }).click();
  await expect(page).toHaveURL(/\/assets\?type=printer$/);
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Tür", exact: true })).toContainText("Yazıcı");

  await page.getByRole("button", { name: "Temizle" }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Tür", exact: true })).toContainText("Tüm türler");
  await expect(rows.first()).toContainText("Depo Yazıcısı");
  await page.getByRole("link", { name: "Cihaz adı sütununa göre sırala" }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await expect(rows.first()).toContainText("Muhasebe PC");
});

test("editing a device changes its status", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets");
  await page.getByRole("link", { name: "Muhasebe PC" }).click();
  await page.getByRole("link", { name: "Düzenle" }).click();
  await expect(page.getByLabel("Etiket no")).toHaveValue("D-0001");
  await choose(page, "Durum", "Tamirde");
  await page.getByLabel("Model").fill("ThinkPad E14");
  await page.getByLabel("İşlemci").fill("Intel Core i5-13500");
  await page.getByLabel("RAM (GB)").fill("çok");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("GB cinsinden tam sayı gir (ör. 16).")).toBeVisible();

  await page.getByLabel("RAM (GB)").fill("16");
  await page.getByLabel("İşletim sistemi").fill("Windows 11 Pro");
  await page.getByLabel("IP adresi").fill("192.168.1.21");
  await page.getByRole("button", { name: "Kaydet" }).click();

  await expect(page).toHaveURL(/\/assets\/\d+$/);
  await expect(page.getByText("Tamirde").first()).toBeVisible();
  await expect(page.getByText("Teknik özellikler")).toBeVisible();
  await expect(page.getByText("Intel Core i5-13500")).toBeVisible();
  await expect(page.getByText("16 GB")).toBeVisible();
  await expect(page.getByText("Windows 11 Pro")).toBeVisible();

  // A device is found by its IP address too.
  await page.goto("/assets");
  await page.getByRole("searchbox", { name: "Ara" }).fill("192.168.1.21");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("Muhasebe PC");
});

test("a new device of a known model gets its specifications filled in", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByLabel("Marka").fill("LENOVO");
  await page.getByLabel("Model").fill("thinkpad e14");
  await page.getByLabel("Model").press("Tab");

  await expect(page.getByText("Özellikler aynı modeldeki Muhasebe PC (D-0001) cihazından dolduruldu.")).toBeVisible();
  await expect(page.getByLabel("İşlemci")).toHaveValue("Intel Core i5-13500");
  await expect(page.getByLabel("RAM (GB)")).toHaveValue("16");
  await expect(page.getByLabel("İşletim sistemi")).toHaveValue("Windows 11 Pro");
  // Values that belong to one device are not copied.
  await expect(page.getByLabel("IP adresi")).toHaveValue("");

  // If something is already typed, nothing is overwritten without asking.
  await page.reload();
  await page.getByLabel("İşlemci").fill("AMD Ryzen 5");
  await page.getByLabel("Marka").fill("Lenovo");
  await page.getByLabel("Model").fill("ThinkPad E14");
  await page.getByLabel("Model").press("Tab");
  await expect(page.getByText("Aynı modelde kayıtlı bir cihaz var: Muhasebe PC (D-0001).")).toBeVisible();
  await expect(page.getByLabel("İşlemci")).toHaveValue("AMD Ryzen 5");
  await page.getByRole("button", { name: "Özelliklerini kullan" }).click();
  await expect(page.getByLabel("İşlemci")).toHaveValue("Intel Core i5-13500");

  // An unknown model changes nothing.
  await page.reload();
  await page.getByLabel("Marka").fill("Lenovo");
  await page.getByLabel("Model").fill("Hiç Görülmemiş Model");
  await page.getByLabel("Model").press("Tab");
  await expect(page.getByLabel("İşlemci")).toHaveValue("");
});

test("the serial number is read from the camera", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByRole("button", { name: "Seri no barkodunu okut" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expect(page.getByLabel("Seri no", { exact: true })).toHaveValue(FAKE_CAMERA_TEXT, { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("without a live camera, the code is read from a photo instead", async ({ page }) => {
  // As on a phone opening the site over plain HTTP, or when permission is refused.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByRole("button", { name: "Seri no barkodunu okut" }).click();
  await expect(page.getByText("Kamera izni verilmedi. İzin verebilir ya da fotoğraf çekerek okutabilirsin.")).toBeVisible();

  const photo = page.getByLabel("Fotoğraf çekerek oku");
  await photo.setInputFiles({ name: "bos.png", mimeType: "image/png", buffer: BLANK_PNG });
  await expect(page.getByText("Fotoğrafta kod bulunamadı.")).toBeVisible();

  await photo.setInputFiles({ name: "etiket.png", mimeType: "image/png", buffer: await QRCode.toBuffer("SN-FOTO-777", { width: 2400, margin: 4 }) });
  await expect(page.getByLabel("Seri no", { exact: true })).toHaveValue("SN-FOTO-777");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the dashboard summarises the company's devices", async ({ page }) => {
  await signInAdmin(page);
  await expect(page.getByText("Türe göre")).toBeVisible();
  await page.getByRole("link", { name: /Yazıcı/ }).click();
  await expect(page).toHaveURL(/\/assets\?type=printer$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("another company starts with an empty inventory", async ({ page }) => {
  await signInAdmin(page);
  await switchCompany(page, "Boğaziçi Tekstil");
  await expect(page.getByRole("main").getByText("Boğaziçi Tekstil")).toBeVisible();
  await page.getByRole("link", { name: "Donanım", exact: true }).click();
  await expect(page.getByText("Bu şirkette henüz cihaz yok.")).toBeVisible();

  await addDevice(page, { name: "Gizli Sunucu", type: "Sunucu" });
  await expect(page.getByRole("heading", { name: "Gizli Sunucu" })).toBeVisible();
  await expect(page.getByText("D-0001").first()).toBeVisible();
  hiddenAssetPath = new URL(page.url()).pathname;

  // Reactivate the technician (assigned to Akdeniz Lojistik only) for the next test.
  await page.getByRole("link", { name: "Kullanıcılar" }).click();
  await page.getByRole("button", { name: "Düzenle: tech.ayse" }).click();
  await page.getByLabel("Aktif (giriş yapabilir)").check();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("row", { name: /tech\.ayse/ })).toContainText("Aktif");
  await signOut(page);
});

test("a technician cannot open another company's device, even by direct link", async ({ page }) => {
  await signIn(page, TECH);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();

  await page.goto("/assets");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText("Gizli Sunucu")).toHaveCount(0);

  const response = await page.goto(hiddenAssetPath);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Gizli Sunucu")).toHaveCount(0);

  const edit = await page.goto(`${hiddenAssetPath}/edit`);
  expect(edit?.status()).toBe(404);

  await page.goto("/assets");
  await page.getByRole("link", { name: "Depo Yazıcısı" }).click();
  await expect(page.getByRole("button", { name: "Sil" })).toHaveCount(0);
});

test("admin deletes a device after confirming", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets");
  await page.getByRole("link", { name: "Depo Yazıcısı" }).click();
  await page.getByRole("button", { name: "Sil" }).click();
  await expect(page.getByText("Depo Yazıcısı (D-0002) kalıcı olarak silinir.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();

  await expect(page).toHaveURL(/\/assets$/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("Depo Yazıcısı")).toHaveCount(0);
});
