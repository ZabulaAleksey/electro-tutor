import { expect, test } from "@playwright/test";

const routeMatrix = [
  { path: "/", ru: "От формулы", uk: "Від формули" },
  { path: "/topics/", ru: "Карта электротехники", uk: "Мапа електротехніки" },
  { path: "/interactive/", ru: "Интерактив", uk: "Інтерактив" },
  { path: "/classroom/", ru: "Кабинет занятия", uk: "Кабінет заняття" },
  { path: "/services/", ru: "Услуги", uk: "Послуги" },
  { path: "/contacts/", ru: "Контакты", uk: "Контакти" },
  { path: "/topics/dc/mesh-current-method/", ru: "Метод контурных токов", uk: "Метод контурних струмів" },
] as const;

for (const { path, ru, uk } of routeMatrix) {
  for (const language of ["ru", "uk"] as const) {
    test(`${language}${path} has localized content and metadata parity`, async ({ page }) => {
      await page.goto(`/${language}${path}`);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByText(language === "ru" ? ru : uk, { exact: false }).first()).toBeVisible();
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S+/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      for (const hreflang of ["ru", "uk", "x-default"]) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`)).toHaveCount(1);
      }
      await expect(page.getByRole("navigation")).toHaveAttribute("aria-label", language === "ru" ? "Основная навигация" : "Головна навігація");
    });
  }
}

test("root redirects to the declared Russian default locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ru\/$/);
});

test("Ukrainian diagram exposes localized controls and recovery error", async ({ page }) => {
  await page.goto("/uk/interactive/?v=99&i0m=broken");
  await expect(page.getByRole("status")).toContainText("Відновлено безпечні початкові значення");
  await expect(page.getByRole("img", { name: "Колова діаграма струмів" })).toBeVisible();
  await expect(page.getByText("Струм холостого ходу I₀", { exact: true })).toBeVisible();
  await expect(page.getByText("Опір навантаження R", { exact: false })).toBeVisible();
});

test("Ukrainian classroom exposes localized controls and network error", async ({ page }) => {
  await page.route("https://meet.jit.si/external_api.js", (route) => route.abort());
  await page.goto("/uk/classroom/");
  await expect(page.getByLabel("Ваше ім’я")).toBeVisible();
  await expect(page.getByLabel("Код кімнати")).toHaveValue(/lesson-/);
  await page.getByRole("button", { name: "Увійти до кабінету" }).click();
  await expect(page.getByText("Не вдалося завантажити відеокабінет", { exact: false })).toBeVisible();
});
