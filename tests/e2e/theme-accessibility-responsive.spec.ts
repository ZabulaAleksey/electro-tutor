import { expect, test, type Page, type TestInfo } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    const blockedExternalFont =
      text === "Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED";
    if (message.type() === "error" && !blockedExternalFont) {
      errors.push(`console: ${text}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const externalFont =
      url.startsWith("https://fonts.googleapis.com/") ||
      url.startsWith("https://fonts.gstatic.com/");
    if (!externalFont) {
      errors.push(
        `requestfailed: ${url} (${request.failure()?.errorText ?? "unknown error"})`,
      );
    }
  });

  return errors;
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

test("theme is keyboard operable and persists across reload and navigation", async ({ page }, testInfo) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.goto("/ru/");
  await page.evaluate(() => localStorage.setItem("potential-theme", "light"));
  await page.reload();

  const toggle = page.getByRole("button", { name: "Переключить тему" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("potential-theme"))).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Все темы", exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/topics\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await attachViewport(page, testInfo, "dark-theme-catalog");
  expect(runtimeErrors).toEqual([]);
});

test("desktop Tab navigation reaches named controls and activates the theme button", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.addInitScript(() => localStorage.setItem("potential-theme", "light"));
  await page.goto("/ru/interactive/");

  const reachedNames: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    const name = await focused.getAttribute("aria-label")
      ?? (await focused.textContent())?.trim()
      ?? "";
    if (name) reachedNames.push(name);
    if (await focused.getAttribute("id") === "theme-toggle") break;
  }

  await expect(page.locator("#theme-toggle")).toBeFocused();
  expect(reachedNames.some((name) => name.includes("Потенциал"))).toBe(true);
  expect(reachedNames.some((name) => name.includes("Установить приложение"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(runtimeErrors).toEqual([]);
});

const mobileRoutes = [
  { name: "RU home", path: "/ru/" },
  { name: "UK home", path: "/uk/" },
  { name: "RU catalog", path: "/ru/topics/" },
  { name: "UK catalog", path: "/uk/topics/" },
  { name: "RU lesson", path: "/ru/topics/dc/mesh-current-method/" },
  { name: "UK lesson", path: "/uk/topics/dc/mesh-current-method/" },
  { name: "RU interactive", path: "/ru/interactive/" },
  { name: "UK interactive", path: "/uk/interactive/" },
] as const;

for (const route of mobileRoutes) {
  test(`${route.name} has a meaningful, overflow-free mobile layout`, async ({ page }, testInfo) => {
    const runtimeErrors = captureRuntimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(route.path);

    expect(response?.ok()).toBe(true);
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("main h1")).toHaveCount(1);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await attachViewport(page, testInfo, `${route.name.toLowerCase().replaceAll(" ", "-")}-mobile`);
    expect(runtimeErrors).toEqual([]);
  });
}

test("mobile menu is named and supports Enter and Escape", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ru/");

  const menu = page.getByRole("button", { name: "Открыть меню" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(runtimeErrors).toEqual([]);
});

test("essential icon controls and lesson diagrams expose accessible names and live output", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.goto("/ru/topics/dc/mesh-current-method/");

  await expect(page.getByRole("button", { name: "Переключить тему" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Установить приложение" })).toBeVisible();
  await expect(page.getByRole("link", { name: "UA" })).toBeVisible();
  await expect(page.getByRole("img", { name: /схема|диаграмма/i })).toBeVisible();

  await page.goto("/ru/interactive/");
  await expect(page.locator("[aria-live='polite'].circle-readout")).toBeVisible();
  await expect(page.locator("[aria-live='polite'].circle-readout")).not.toBeEmpty();
  expect(runtimeErrors).toEqual([]);
});
