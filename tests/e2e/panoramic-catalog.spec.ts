import { expect, test } from "@playwright/test";

test("shared laboratory catalogue exposes real items, filters, and whole-card links", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/ru/interactive/");
  const catalogue = page.locator("[data-catalogue-count]");
  expect(await catalogue.locator(".catalogue-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  await expect(catalogue).toHaveAttribute("data-catalogue-count", "31");
  await expect(catalogue.locator(".catalogue-card")).toHaveCount(12);
  await catalogue.getByRole("button", { name: "Показать ещё", exact: true }).click();
  await expect(catalogue.locator(".catalogue-card")).toHaveCount(31);
  await expect(catalogue.locator(".catalogue-card img").first()).toHaveJSProperty("complete", true);
  expect(await catalogue.locator(".catalogue-card img").first().evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await catalogue.getByRole("button", { name: "Электроника", exact: true }).click();
  await expect(catalogue.locator(".catalogue-card")).toHaveCount(2);
  await catalogue.getByRole("button", { name: "Все", exact: true }).click();
  await catalogue.locator("input[type=search]").fill("балка");
  await expect(catalogue.locator(".catalogue-card")).toHaveCount(1);
  await expect(catalogue.locator(".catalogue-card").first().locator(".." )).toHaveAttribute("href", "/ru/interactive/beam/");
  await expect(catalogue.locator(".catalogue-card").first().locator("a")).toHaveCount(0);
});

test("textbook cards keep topic-specific engineering illustrations on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ru/topics/");
  await expect(page.getByRole("heading", { level: 1, name: "Учебник" })).toBeVisible();
  await expect(page.locator('[data-tool-art="ohm"]')).toHaveCount(1);
  await expect(page.locator(".curriculum-section").first().locator('[data-tool-art="kirchhoff"]')).toHaveCount(1);
  await expect(page.locator('[data-tool-art="mesh"]')).toHaveCount(1);
  await expect(page.locator(".curriculum-section").first().locator('[data-tool-art="nodes"]')).toHaveCount(1);
  await expect(page.locator('[data-tool-art="thevenin"]')).toHaveCount(1);
  await expect(page.locator(".topic-cover img").first()).toHaveJSProperty("complete", true);
  expect(await page.locator(".topic-cover img").first().evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("navigation keeps the student-facing five destinations and moves install to services", async ({ page }) => {
  await page.goto("/ru/");
  await expect(page.locator(".astro-header nav > a")).toHaveText(["Главная", "Учебник", "Лаборатории", "Доска"]);
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
