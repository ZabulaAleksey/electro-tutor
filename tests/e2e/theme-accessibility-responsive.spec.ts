import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { useUnavailableIdentity } from "./helpers/static-identity";

test.beforeEach(async ({ page }) => useUnavailableIdentity(page));

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

test("light appearance persists across reload and navigation under a dark OS", async ({ page }, testInfo) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("potential-theme", "dark"));
  await page.goto("/ru/");
  await expect(page.locator("#theme-toggle")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator(".astro-header").getByRole("link", { name: "Учебник", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/ru\/topics\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await attachViewport(page, testInfo, "light-catalog-dark-os");
  expect(runtimeErrors).toEqual([]);
});

test("desktop Tab navigation reaches named controls and the catalogue search", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ru/interactive/");

  const reachedNames: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    const name = await focused.getAttribute("aria-label")
      ?? (await focused.textContent())?.trim()
      ?? "";
    if (name) reachedNames.push(name);
    if (await focused.getAttribute("data-directory-search") !== null) break;
  }

  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  expect(reachedNames.some((name) => name.includes("ElectroTutor"))).toBe(true);
  expect(reachedNames.some((name) => name === "Решения")).toBe(true);
  await search.pressSequentially("Фурье");
  await expect(page.locator("#labs [data-directory-entry]:visible")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
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
    await expect(page.locator("main h1:visible")).toHaveCount(1);
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

  await expect(page.locator(".astro-header").getByRole("link", { name: "Решения", exact: true })).toBeVisible();
  await expect(page.locator(".site-footer a[href$='/my-services/']")).toBeVisible();
  await page.getByRole("button", { name: /выбрать язык/i }).click();
  await expect(page.getByRole("menuitemradio", { name: "Українська" })).toBeVisible();
  await expect(page.getByRole("img", { name: /схема|диаграмма/i })).toBeVisible();

  await page.goto("/ru/interactive/circular-diagram/");
  await expect(page.locator("[aria-live='polite'].circle-readout")).toBeVisible();
  await expect(page.locator("[aria-live='polite'].circle-readout")).not.toBeEmpty();
  expect(runtimeErrors).toEqual([]);
});
