import { expect, test } from "@playwright/test";
import { ADMIN, signIn, TECH } from "./helpers";

test.describe.configure({ mode: "serial" });

test("an unknown address shows a Turkish 404 inside the app (QA D1)", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();

  const response = await page.goto("/boyle-bir-sayfa-yok");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Donanım" })).toBeVisible(); // the menu is there
  await page.getByRole("link", { name: "Panoya dön" }).click();
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();

  await page.goto("/assets/999999");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
});

test("responses carry security headers and no framework banner (QA D2)", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("a technician needs a company and an easy password is refused (QA D8, D9)", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await page.goto("/users");
  await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ad soyad").fill("Şirketsiz Teknisyen");
  await dialog.getByLabel("Kullanıcı adı").fill("tech.sirketsiz");
  await dialog.getByLabel("Parola", { exact: true }).fill("1111111111");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  await expect(dialog.getByText("Teknisyene en az bir şirket ata.")).toBeVisible();
  await expect(dialog.getByText(/Bu parola çok kolay tahmin edilir/)).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
});

test("changing your password asks for it twice (QA D9)", async ({ page }) => {
  await signIn(page, TECH);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await page.goto("/account");
  await page.getByLabel("Mevcut parola").fill(TECH.password);
  await page.getByLabel("Yeni parola", { exact: true }).fill("bahar-yagmuru-2027");
  await page.getByLabel("Yeni parola (tekrar)").fill("bahar-yagmuru-2028");
  await page.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(page.getByText("İki parola aynı değil.")).toBeVisible();
});

test("drop-downs in forms are named by their label, and content can be reached directly (QA D12)", async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await page.goto("/assets/new");
  await expect(page.getByRole("combobox", { name: "Tür", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Durum", exact: true })).toBeVisible();

  // The device form focuses its first field, so the skip link is tried on the dashboard.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pano" })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "İçeriğe atla" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
