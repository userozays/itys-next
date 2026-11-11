import { expect, test, type Page } from "@playwright/test";
import { ADMIN, companySwitcher, signIn, signOut, switchCompany, TECH } from "./helpers";

// One story, in order, against a database that starts empty.
test.describe.configure({ mode: "serial" });

async function addCompany(page: Page, name: string) {
  await page.getByRole("button", { name: "Yeni şirket" }).click();
  await page.getByLabel("Şirket adı").fill(name);
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

test("health endpoint reports a working database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(await res.json()).toEqual({ status: "ok", database: "ok" });
});

test("an empty system sends visitors to first-time setup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "İlk kurulum" })).toBeVisible();
});

test("setup rejects a short password, then creates the admin and signs in", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("Ad soyad").fill("Sistem Yöneticisi");
  await page.getByLabel("Kullanıcı adı").fill(ADMIN.username);
  await page.getByLabel("Parola").fill("short");
  await page.getByRole("button", { name: "Yönetici hesabını oluştur" }).click();
  await expect(page.getByText("Parola en az 10 karakter olmalı.")).toBeVisible();
  await expect(page.getByLabel("Ad soyad")).toHaveValue("Sistem Yöneticisi");

  await page.getByLabel("Parola").fill(ADMIN.password);
  await page.getByRole("button", { name: "Yönetici hesabını oluştur" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await expect(page.getByText("Hoş geldin, Sistem Yöneticisi")).toBeVisible();
});

test("setup is closed once an admin exists", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password is rejected with a generic message", async ({ page }) => {
  await signIn(page, { username: ADMIN.username, password: "wrong-password" });
  await expect(page.getByText("Kullanıcı adı ya da parola hatalı.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("admin adds two companies and a technician assigned to one of them", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.getByRole("link", { name: "Şirketler" }).click();
  await addCompany(page, "Akdeniz Lojistik");
  await addCompany(page, "Boğaziçi Tekstil");

  await page.getByRole("button", { name: "Yeni şirket" }).click();
  await page.getByLabel("Şirket adı").fill("Akdeniz Lojistik");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Bu adda bir şirket zaten var.")).toBeVisible();
  await page.getByRole("button", { name: "Vazgeç" }).click();

  await page.getByRole("link", { name: "Kullanıcılar" }).click();
  await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad soyad").fill("Ayşe Teknisyen");
  await dialog.getByLabel("Kullanıcı adı").fill(TECH.username);
  await dialog.getByLabel("Parola", { exact: true }).fill(TECH.password);
  await dialog.getByLabel("Akdeniz Lojistik").check();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row", { name: /tech\.ayse/ });
  await expect(row).toContainText("Teknisyen");
  await expect(row).toContainText("Akdeniz Lojistik");
  await expect(row).not.toContainText("Boğaziçi Tekstil");
  await signOut(page);
});

test("technician sees only the assigned company and no admin screens", async ({ page }) => {
  await signIn(page, TECH);
  await expect(page.getByText("Hoş geldin, Ayşe Teknisyen")).toBeVisible();

  await companySwitcher(page).click();
  await expect(page.getByRole("option")).toHaveText(["Akdeniz Lojistik"]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Kullanıcılar" })).toHaveCount(0);

  await page.getByRole("link", { name: "Şirketler" }).click();
  await expect(page.getByRole("cell", { name: "Akdeniz Lojistik" })).toBeVisible();
  await expect(page.getByText("Boğaziçi Tekstil")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Yeni şirket" })).toHaveCount(0);

  await page.goto("/users");
  await expect(page).toHaveURL(/\/$/);
  await signOut(page);
});

test("admin switches the working company and it sticks", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(companySwitcher(page)).toContainText("Akdeniz Lojistik");
  await switchCompany(page, "Boğaziçi Tekstil");
  await expect(page.getByRole("main").getByText("Boğaziçi Tekstil")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("main").getByText("Boğaziçi Tekstil")).toBeVisible();
});

test("deactivating the technician ends their access", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.getByRole("link", { name: "Kullanıcılar" }).click();
  await page.getByRole("button", { name: "Düzenle: tech.ayse" }).click();
  await page.getByLabel("Aktif (giriş yapabilir)").uncheck();
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("row", { name: /tech\.ayse/ })).toContainText("Pasif");
  await signOut(page);

  await signIn(page, TECH);
  await expect(page.getByText("Kullanıcı adı ya da parola hatalı.")).toBeVisible();
});

test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
  await page.goto("/companies");
  await expect(page).toHaveURL(/\/login\?next=%2Fcompanies$/);
});
