import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, signIn } from "./helpers";

// Builds on 01–07: Akdeniz Lojistik has "Muhasebe PC" (D-0001) in "Merkez Ofis".
test.describe.configure({ mode: "serial" });

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

test("a location name opens its devices (QA Ö3)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/locations");
  await page.getByRole("link", { name: "Merkez Ofis", exact: true }).click();
  await expect(page).toHaveURL(/\/assets\?location=\d+$/);
  await expect(page.getByRole("link", { name: /Muhasebe PC/ })).toBeVisible();
});

test("names already assigned are suggested while typing (QA Ö4)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets/new");
  await page.getByLabel("Cihaz adı").fill("Öneri Kaynağı");
  await page.getByLabel("Zimmetli kişi").fill("Şükrü Öztürk");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Öneri Kaynağı" })).toBeVisible();

  await page.goto("/assets/new");
  await page.getByLabel("Zimmetli kişi").fill("sukru");
  await page.getByRole("option", { name: "Şükrü Öztürk" }).click();
  await expect(page.getByLabel("Zimmetli kişi")).toHaveValue("Şükrü Öztürk");
});

test("changing the tag of a device warns about printed labels", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets");
  await page.getByRole("link", { name: /Muhasebe PC/ }).first().click();
  await page.getByRole("link", { name: "Düzenle" }).click();
  const warning = page.getByText(/basılmış QR etiketi artık onu açmaz/);
  await expect(warning).toHaveCount(0);
  await page.getByLabel("Etiket no").fill("D-0999");
  await expect(warning).toBeVisible();
  await page.getByLabel("Etiket no").fill("d-0001"); // back to the same tag, in other letters
  await expect(warning).toHaveCount(0);
});

test("the device list downloads as Excel and CSV with its filters (QA Ö1)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/assets?q=muhasebe");

  await page.getByRole("button", { name: "Dışa aktar" }).click();
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^cihazlar-Akdeniz-Lojistik-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsxBytes = await readFile((await xlsx.path())!);
  expect(xlsxBytes.subarray(0, 2).toString()).toBe("PK"); // a zip, as xlsx files are

  await page.getByRole("button", { name: "Dışa aktar" }).click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "CSV (.csv)" }).click()]);
  const text = await readFile((await csv.path())!, "utf8");
  const lines = text.replace(/^﻿/, "").trim().split("\r\n");
  expect(lines[0]).toMatch(/^Etiket no;Cihaz adı;Tür;Durum;/);
  expect(lines.slice(1).every((line) => /muhasebe/i.test(line))).toBe(true);
  expect(lines.length).toBeGreaterThan(1);
});

test("the license list downloads without license keys (QA Ö1)", async ({ page, request }) => {
  await signInAdmin(page);
  await page.goto("/licenses");
  await page.getByRole("button", { name: "Dışa aktar" }).click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "CSV (.csv)" }).click()]);
  const text = await readFile((await csv.path())!, "utf8");
  expect(text).toContain("Yazılım;Üretici;Lisans tipi;Yenileme periyodu;Koltuk sayısı");
  expect(text).not.toContain("Lisans anahtarı");

  // Signed out, there is nothing to download.
  const anonymous = await request.get("/licenses/export?format=csv", { maxRedirects: 0 });
  expect(anonymous.status()).not.toBe(200);
});

test("on a phone the dashboard shows two cards per row and the company name in full", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAdmin(page);
  await expect(page.getByText(/aktif \(hurda hariç\)/)).toBeVisible();

  const cards = page.getByRole("main").locator("[data-slot=card]");
  const [first, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(first!.y).toBe(second!.y); // side by side

  const switcher = page.getByRole("combobox", { name: "Çalışılan şirket" });
  const fits = await switcher.evaluate((el) => {
    const value = el.querySelector("[data-slot=select-value]") as HTMLElement;
    return value.scrollWidth <= value.clientWidth;
  });
  expect(fits).toBe(true);
});
