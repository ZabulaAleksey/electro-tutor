import { expect, test } from "@playwright/test";

test("laboratory catalogue keeps real items, subject groups, and direct links", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/ru/interactive/");
  const catalogue = page.locator("#labs");
  const entries = catalogue.locator("[data-directory-entry]");
  await expect(entries).toHaveCount(31);
  const electronics = catalogue.locator("details").filter({ has: page.getByText("Электроника", { exact: true }) });
  await expect(electronics.locator("[data-directory-entry]")).toHaveCount(2);
  await electronics.locator("summary").click();
  await expect(electronics.locator("[data-directory-entry]:visible")).toHaveCount(0);
  await catalogue.getByRole("searchbox").fill("Электроника");
  await expect(electronics.locator("[data-directory-entry]:visible")).toHaveCount(2);
  await catalogue.getByRole("searchbox").fill("балка");
  const result = catalogue.locator("[data-directory-entry]:visible");
  await expect(result).toHaveCount(1);
  await expect(result.getByRole("link")).toHaveAttribute("href", "/ru/interactive/beam/");
  await result.getByRole("link").click();
  await expect(page).toHaveURL("/ru/interactive/beam/");
});

test("the textbook fits narrow viewports and avoids empty topic links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ru/topics/");
  await expect(page.getByRole("heading", { level: 1, name: "Учебник" })).toBeVisible();
  const ohm = page.locator("#topic-dc-ohm");
  await expect(ohm.locator("a[href$='#micro=ohm-law']")).toBeVisible();
  await expect(ohm.getByRole("link", { name: "Учебник", exact: true })).toHaveCount(0);
  await expect(page.locator("#topic-dc-mesh").getByRole("link", { name: "Учебник", exact: true })).toBeVisible();
  await expect(page.locator("#topic-dc-thevenin")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("navigation exposes three catalogues, tutoring and contacts while install stays in services", async ({ page }) => {
  await page.goto("/ru/");
  await expect(page.locator(".astro-header nav > a")).toHaveText(["Учебник", "Лаборатории", "Инструменты", "Главная", "Доска", "Репетиторство", "Контакты"]);
  await page.locator(".nav-services summary").click();
  await expect(page.locator(".nav-services-menu")).toBeVisible();
  await expect(page.locator(".nav-services-menu").getByRole("link",{name:"Приложение ElectroTutor",exact:true})).toHaveAttribute("href","/ru/my-services/#install");
  await expect(page.locator("#app-install")).toHaveCount(0);
  await page.goto("/ru/my-services/");
  await expect(page.locator("#app-install")).toBeVisible();
  await page.locator("#app-install").click();
  await expect(page.locator("#install-dialog")).toBeVisible();
  await expect(page.locator("footer")).not.toContainText("Учимся понимать");
});
