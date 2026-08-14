import { expect, test, type Page } from "@playwright/test";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(
      `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    );
  });

  return errors;
}

test("NFR-006 renders main content while Google Fonts CSS is held", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  let releaseFontRequest!: () => void;
  let completeFontRequest!: () => void;
  let fontRequestSeen = false;
  const fontRequestHeld = new Promise<void>((resolve) => {
    releaseFontRequest = resolve;
  });
  const fontRequestCompleted = new Promise<void>((resolve) => {
    completeFontRequest = resolve;
  });

  await page.route("https://fonts.googleapis.com/**", async (route) => {
    fontRequestSeen = true;
    await fontRequestHeld;
    try {
      await route.fulfill({
        status: 200,
        contentType: "text/css; charset=utf-8",
        body: "/* deterministic test response */",
      });
    } finally {
      completeFontRequest();
    }
  });

  try {
    const response = await page.goto("/ru/", {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });

    expect(response?.ok()).toBe(true);
    await expect(page.locator("main h1")).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => fontRequestSeen).toBe(true);

    releaseFontRequest();
    await fontRequestCompleted;
    await page.waitForLoadState("load");
    expect(runtimeErrors).toEqual([]);
  } finally {
    releaseFontRequest();
  }
});
