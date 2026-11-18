import { expect, type Page } from "@playwright/test";

// Spec files run in name order against one database that starts empty:
// 01 creates these accounts and the two companies, later files build on them.
// The admin password must not contain the username (QA D9).
export const ADMIN = { username: "admin", password: "yonetim-kalesi-2026" };
export const TECH = { username: "tech.ayse", password: "tech-password-1" };

export async function signIn(page: Page, user: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Kullanıcı adı").fill(user.username);
  await page.getByLabel("Parola").fill(user.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  await page.getByRole("menuitem", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export const companySwitcher = (page: Page) => page.getByRole("combobox", { name: "Çalışılan şirket" });

/** Picks a company from the switcher in the top bar. */
export async function switchCompany(page: Page, name: string) {
  await companySwitcher(page).click();
  await page.getByRole("option", { name }).click();
  await expect(companySwitcher(page)).toContainText(name);
}

/** Picks an option from one of the app's drop-downs, found by its label. */
export async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("combobox", { name: label, exact: true })).toContainText(option);
}

/** The options a drop-down offers; opens it, reads them and closes it again. */
export async function optionsOf(page: Page, label: string): Promise<string[]> {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const texts = await page.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  return texts;
}

/** Picks a device in the searchable device list (license assignment), typing part of its name first. */
export async function pickDevice(page: Page, label: string, option: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(option.slice(0, 5));
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(input).toHaveValue(option);
}
