import { expect, test } from "@playwright/test";

test("RUN3B complete textbook is real static HTML without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/ru/topics/dc/mesh-current-method/");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator(".lesson-section h2")).toHaveCount(11);
    await expect(page.locator(".level-picker")).toHaveCount(0);
    await expect(page.locator(".katex-error")).toHaveCount(0);
    await expect(page.locator("#step-5")).toContainText("Независимая проверка узловым методом");
    await expect(page.locator("#step-5")).toContainText("Типичные ошибки");
    await expect(page.locator(".circuit")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Разделы учебника" })).toBeVisible();
    await page.locator(".textbook-toc a[href='#step-4']").click();
    await expect(page).toHaveURL(/#step-4$/);
    await expect(page.locator("#step-4 h2").first()).toBeInViewport();
  } finally { await context.close(); }
});

test("RUN3B former depth preferences cannot hide material or corrupt stored progress", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("potential-level", "3"));
  await page.goto("/ru/topics/dc/mesh-current-method/");
  await expect(page.locator(".lesson-section h2")).toHaveCount(11);
  await expect(page.locator(".level-picker")).toHaveCount(0);
  await expect(page.locator("#step-3")).toContainText("взаимное сопротивление");
  await page.reload();
  await expect(page.locator(".lesson-section h2")).toHaveCount(11);
  expect(await page.evaluate(() => localStorage.getItem("potential-level"))).toBe("3");
  await page.getByLabel("Ваш ответ").fill("2,18");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.locator("#practice-feedback")).toContainText("Верно");
  await page.reload();
  await expect(page.locator("#practice-feedback")).toContainText("Верно");
});

test("RUN3B native wheel and mobile keyboard anchors keep long reading usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/ru/topics/dc/mesh-current-method/");
  await page.mouse.move(180, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  // Wheel/focus can still be moving the viewport when the first scroll event arrives.
  // Wait for the actual scrolling to settle; keep all anchor/progress assertions unchanged.
  const settleScroll = () => page.evaluate(() => new Promise<void>(resolve => {
    let previous = scrollY;
    let stable = 0;
    const sample = () => {
      stable = scrollY === previous ? stable + 1 : 0;
      previous = scrollY;
      if (stable >= 5) resolve(); else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await settleScroll();
  const link = page.locator(".textbook-toc a[href='#step-3']");
  await link.focus();
  await settleScroll();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#step-3$/);
  await expect(page.locator("#step-3 h2").first()).toBeInViewport();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("potential-learning:v1:guest") || "{}").lessons?.["mesh-current-method"]?.highestStep)).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
