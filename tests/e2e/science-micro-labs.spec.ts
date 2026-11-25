import { expect, test } from "@playwright/test";
import { scienceCatalog } from "../../src/science/models";

const scienceCardLinks = '[data-lab-card][href*="/interactive/experiments/science/"]';

test("science micro labs expose model changes, reset, search and permalink", async ({ page }) => {
  test.slow();
  await page.goto("/ru/micro-labs/");
  await expect(page.locator(scienceCardLinks)).toHaveCount(12);
  for (const { id } of scienceCatalog) {
    await test.step(id, async () => {
      await page.goto("/ru/interactive/experiments/science/" + id + "/");
      const card = page.locator('[data-science-id="' + id + '"]');
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
    });
  }
  await page.goto("/ru/micro-labs/");
  await page.locator("[data-directory-search]").fill("маятник");
  const match = page.locator(scienceCardLinks + ":visible");
  await expect(match).toHaveCount(1);
  await match.click();
  await expect(page).toHaveURL("/ru/interactive/experiments/science/pendulum/");
  const pendulum = page.locator('[data-science-id="pendulum"]');
  await expect(pendulum.locator("[data-science-result]")).toBeVisible();
  await page.goto("/ru/micro-labs/#science=pendulum");
  await expect(pendulum).toHaveAttribute("data-selected", "true");
  await page.reload();
  await expect(page).toHaveURL("/ru/micro-labs/#science=pendulum");
  await expect(pendulum).toHaveAttribute("data-selected", "true");
});

test("science micro labs retain state when OS appearance changes and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk/micro-labs/");
  await expect(page.locator(scienceCardLinks)).toHaveCount(12);
  await page.goto("/uk/interactive/experiments/science/complex-vector/");
  const card = page.locator('[data-science-id="complex-vector"]');
  const slider = card.locator("input[type=range]").first();
  const mobileStep = Number(await slider.getAttribute("step"));
  await slider.fill(String(Number(await slider.inputValue()) + mobileStep));
  const retainedValue = await slider.inputValue();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(slider).toHaveValue(retainedValue);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
