import { expect, test } from "@playwright/test";

test("real DC controls, manual navigation, retained parameters and permanent link", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ru/");
  await expect(page.locator('[data-scene="dc-series"]')).toBeVisible();
  await page.getByRole("slider", { name: "ЭДС E, V", exact: true }).fill("48");
  await expect(page.locator('[data-result="I"]')).toContainText("0,48");
  await expect(page.getByRole("button", { name: "Включить автопоказ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Следующий сюжет", exact: true }).click();
  await expect(page.locator('[data-scene="ac-rlc"]')).toBeVisible();
  await page.getByRole("button", { name: "Предыдущий сюжет", exact: true }).click();
  await expect(page.getByRole("slider", { name: "ЭДС E, V", exact: true })).toHaveValue("48");
  await page.getByRole("button", { name: "Выбрать сюжет: Заряд конденсатора", exact: true }).click();
  await expect(page).toHaveURL(/#story=rc-charge$/); await page.reload();
  await expect(page.locator('[data-scene="rc-charge"]')).toBeVisible();
  await expect(page.locator(".katex-error")).toHaveCount(0); expect(errors).toEqual([]);
});

test("AC parameter changes update RMS results and RC has a pausable physical timeline", async ({ page }) => {
  await page.goto("/ru/#story=ac-rlc");
  const current = page.locator('[data-result="I RMS"]'); const first = await current.innerText();
  await page.getByRole("slider", { name: "Частота f, Hz", exact: true }).fill("100"); await expect(current).not.toHaveText(first);
  await page.getByRole("button", { name: "Выбрать сюжет: Заряд конденсатора", exact: true }).click();
  await expect.poll(() => page.locator('[data-model-time]').innerText()).not.toContain(" 0 s");
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  const paused = await page.locator('[data-model-time]').innerText(); await page.waitForTimeout(250); await expect(page.locator('[data-model-time]')).toHaveText(paused);
  await page.getByRole("slider", { name: "Ёмкость C, µF", exact: true }).fill("2000"); await expect(page.locator('[data-result="τ"]')).toContainText("2");
});

test("catalog searches, filters and links to software illustrations without false simulators", async ({ page }) => {
  await page.goto("/ru/"); await page.getByRole("searchbox").fill("Python");
  await expect(page.locator(".lab-story-card")).toHaveCount(1); await page.locator(".lab-story-card").click();
  await expect(page.locator('[data-scene="python-rc"]')).toBeVisible(); await expect(page.locator(".lab-scene-title")).toContainText("Учебная иллюстрация");
  await page.getByRole("searchbox").fill(""); await page.getByRole("button", { name: "Электропривод", exact: true }).click();
  await expect(page.locator(".lab-story-card")).toHaveCount(0); await expect(page.getByRole("status")).toContainText("пока нет");
});

test("reduced motion stops autoplay and physical clock; direct story survives locale change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/ru/#story=rc-charge");
  await expect(page.locator('[data-scene="rc-charge"]')).toHaveAttribute("data-motion", "paused");
  const before = await page.locator('[data-model-time]').innerText(); await page.waitForTimeout(300); await expect(page.locator('[data-model-time]')).toHaveText(before);
  await expect(page.getByRole("button", { name: "Включить автопоказ", exact: true })).toBeDisabled();
  await page.locator("a[data-language-link]").click(); await expect(page).toHaveURL(/\/uk\/#story=rc-charge$/);
  await expect(page.locator('[data-scene="rc-charge"]')).toBeVisible();
});

test("automatic rotation is 7.5s and hides animations when offscreen", async ({ page }) => {
  await page.goto("/ru/"); await page.mouse.move(0, 0); await expect(page.locator('[data-scene="dc-series"]')).toHaveAttribute("data-motion", "running");
  await expect(page.locator('[data-scene="ac-rlc"]')).toBeVisible({ timeout: 11000 });
  await page.locator("#engineering-gallery").scrollIntoViewIfNeeded(); await expect(page.locator('[data-scene="ac-rlc"]')).toHaveAttribute("data-motion", "paused");
});

test("mobile pointer swipe selects next slide without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/ru/");
  const frame = page.locator(".lab-scene-frame");
  await frame.dispatchEvent("pointerdown", { clientX: 300, clientY: 300 }); await frame.dispatchEvent("pointerup", { clientX: 110, clientY: 305 });
  await expect(page.locator('[data-scene="ac-rlc"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("short desktop keeps complete plots and result links inside every scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const id of ["dc-series", "ac-rlc", "balanced-star", "rc-charge", "diode-load-line", "magnetic-gap", "floating-neutral", "line-reflection"]) {
    await page.goto(`/ru/#story=${id}`); await expect(page.locator(`[data-scene="${id}"]`)).toBeVisible();
    expect(await page.evaluate(() => { const f = document.querySelector(".lab-scene-frame")!.getBoundingClientRect(); return [...document.querySelectorAll(".lab-scene-frame .lab-plot,.lab-scene-frame .lab-result-footer,.lab-scene-frame .lab-assumption")].every(e => e.getBoundingClientRect().bottom <= f.bottom + 1); }), `${id} clipped`).toBe(true);
  }
});

for (const language of ["ru", "uk"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${language} ${theme} every scene has visible schematics and no overflow at mobile and desktop`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await page.goto(`/${language}/`);
      for (const id of ["dc-series", "ac-rlc", "balanced-star", "rc-charge", "diode-load-line", "magnetic-gap", "floating-neutral", "line-reflection"]) {
        await page.goto(`/${language}/#story=${id}`);
        await expect(page.locator(`[data-scene="${id}"]`)).toBeVisible(); await expect(page.locator(".lab-scene-frame .lab-circuit")).toBeVisible();
        await expect(page.locator(".katex-error")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${id}/${width}`).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => { const f = document.querySelector(".lab-scene-frame")!.getBoundingClientRect(); return [...document.querySelectorAll(".lab-scene-frame .lab-plot,.lab-scene-frame .lab-result-footer,.lab-scene-frame .lab-assumption")].every(e => e.getBoundingClientRect().bottom <= f.bottom + 1); }), `${id}/${width} content clipping`).toBe(true);
      }
    }
  });
}
