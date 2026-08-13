import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    const blockedExternalAsset = text === "Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED";
    if (message.type() === "error" && !blockedExternalAsset) errors.push(`console: ${text}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith("https://fonts.googleapis.com/") && !url.startsWith("https://fonts.gstatic.com/")) {
      errors.push(`requestfailed: ${url} (${request.failure()?.errorText ?? "unknown error"})`);
    }
  });

  return errors;
}

const routes = [
  { language: "ru", surface: "home", path: "/ru/", proof: "main h1" },
  { language: "uk", surface: "home", path: "/uk/", proof: "main h1" },
  { language: "ru", surface: "catalog", path: "/ru/topics/", proof: ".catalog-page h1" },
  { language: "uk", surface: "catalog", path: "/uk/topics/", proof: ".catalog-page h1" },
  {
    language: "ru",
    surface: "lesson",
    path: "/ru/topics/dc/mesh-current-method/",
    proof: ".lesson-page h1",
  },
  {
    language: "uk",
    surface: "lesson",
    path: "/uk/topics/dc/mesh-current-method/",
    proof: ".lesson-page h1",
  },
] as const;

for (const route of routes) {
  test(`${route.language.toUpperCase()} ${route.surface} renders without runtime errors`, async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page);

    const response = await page.goto(route.path);

    expect(response?.ok()).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", route.language);
    await expect(page.locator(route.proof)).toBeVisible();
    await expect(page.locator("main")).not.toBeEmpty();
    if (route.surface === "lesson") {
      const levelButtons = page.locator(".level-picker button");
      await expect(levelButtons).toHaveCount(3);
      await levelButtons.nth(2).click();
      await expect(levelButtons.nth(2)).toHaveClass(/selected/);
      await expect(levelButtons.nth(1)).not.toHaveClass(/selected/);
    }
    expect(runtimeErrors).toEqual([]);
  });
}

test("interactive query state is restored and survives a language switch", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await page.goto("/ru/interactive/?i0m=2.75&r=50#state-vector");

  const idleMagnitude = page
    .locator(".circle-controls fieldset")
    .first()
    .getByRole("spinbutton")
    .first();
  const resistancePosition = page.getByRole("slider");

  await expect(idleMagnitude).toHaveValue("2.75");
  await expect(resistancePosition).toHaveValue("50");
  await expect(page.locator(".circle-readout")).toContainText("2.75");
  await expect(page.locator(".resistance-control strong")).toContainText("4");

  await expect
    .poll(() => new URL(page.url()).searchParams.get("phi"))
    .toBe("25");

  const source = new URL(page.url());
  await page.locator("a[data-language-link]").click();
  await expect(page).toHaveURL(/\/uk\/interactive\//);

  const target = new URL(page.url());
  expect(target.pathname).toBe("/uk/interactive/");
  expect(target.search).toBe(source.search);
  expect(target.hash).toBe(source.hash);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(idleMagnitude).toHaveValue("2.75");
  await expect(resistancePosition).toHaveValue("50");

  await page.reload();
  await expect(idleMagnitude).toHaveValue("2.75");
  await expect(resistancePosition).toHaveValue("50");
  expect(runtimeErrors).toEqual([]);
});
