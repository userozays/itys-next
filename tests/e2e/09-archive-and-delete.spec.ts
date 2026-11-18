import { expect, test, type Page } from "@playwright/test";
import { ADMIN, companySwitcher, signIn } from "./helpers";

// Builds on 01–08: Akdeniz Lojistik has devices, licenses and locations.
test.describe.configure({ mode: "serial" });

async function signInAdmin(page: Page) {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
}

async function addCompany(page: Page, name: string, active = true) {
  await page.getByRole("button", { name: "Yeni şirket" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Şirket adı").fill(name);
  if (!active) await dialog.getByLabel(/^Aktif/).uncheck();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test("an admin opens an inactive company from the switcher and sees a notice (QA Ö7)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/companies");
  await addCompany(page, "Eski Müşteri", false);

  await companySwitcher(page).click();
  await expect(page.getByText("Pasif şirketler")).toBeVisible();
  await page.getByRole("option", { name: /Eski Müşteri/ }).click();
  await expect(companySwitcher(page)).toContainText("Eski Müşteri");
  await expect(page.getByRole("status").filter({ hasText: "Eski Müşteri pasif bir şirket" })).toBeVisible();
});

test("only a company without records can be deleted (QA Ö8)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/companies");
  await expect(page.getByRole("button", { name: "Sil: Akdeniz Lojistik" })).toHaveCount(0);

  await addCompany(page, "Yanlış Şirket");
  await page.getByRole("button", { name: "Sil: Yanlış Şirket" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();
  await expect(page.getByRole("row", { name: /Yanlış Şirket/ })).toHaveCount(0);
});

test("a user added by mistake can be deleted, but not your own account (QA Ö8)", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/users");
  await expect(page.getByRole("button", { name: "Sil: admin" })).toHaveCount(0);

  await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad soyad").fill("Yanlış Kullanıcı");
  await dialog.getByLabel("Kullanıcı adı").fill("yanlis.kullanici");
  await dialog.getByLabel("Parola", { exact: true }).fill("kuzey-rüzgarı-2026");
  await dialog.getByLabel("Akdeniz Lojistik").check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Sil: yanlis.kullanici" }).click();
  await expect(page.getByRole("dialog")).toContainText("Cihaz ve lisans kayıtları etkilenmez");
  await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();
  await expect(page.getByRole("row", { name: /yanlis\.kullanici/ })).toHaveCount(0);
});
