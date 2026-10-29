import { expect, test } from "@playwright/test";

test("science micro labs expose model changes, reset, search and permalink", async ({ page }) => {
  await page.goto("/ru/micro-labs/");
  const cards = page.locator("[data-science-id]");
  await expect(cards).toHaveCount(12);
  for (let index = 0; index < 12; index += 1) {
    const card = cards.nth(index);
    const slider = card.locator("input[type=range]").first();
    const beforeValue = await slider.inputValue();
    const beforeResult = await card.locator("[data-science-result]").innerText();
    const step = Number(await slider.getAttribute("step"));
    await slider.fill(String(Number(beforeValue) + step));
    await expect(slider).not.toHaveValue(beforeValue);
    await expect.poll(() => card.locator("[data-science-result]").innerText()).not.toBe(beforeResult);
    await card.locator(".science-reset").click();
    await expect(slider).toHaveValue(beforeValue);
    await expect.poll(() => card.locator("[data-science-result]").innerText()).toBe(beforeResult);
  }
  await page.locator('input[aria-label="Поиск лабораторий"]').fill("маятник");
  await expect(cards).toHaveCount(1);
  await page.locator("[data-science-id]").click();
  await expect(page).toHaveURL(/science=/);
});

test("science micro labs retain state across theme switch and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk/micro-labs/");
  const cards = page.locator("[data-science-id]");
  await expect(cards).toHaveCount(12);
  const slider = cards.nth(2).locator("input[type=range]").first();
  const mobileStep = Number(await slider.getAttribute("step"));
  await slider.fill(String(Number(await slider.inputValue()) + mobileStep));
  const retainedValue = await slider.inputValue();
  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme-toggle").click();
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).not.toBe(themeBefore);
  await expect(slider).toHaveValue(retainedValue);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
