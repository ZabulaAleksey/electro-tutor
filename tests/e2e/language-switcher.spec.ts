import { expect, test } from "@playwright/test";

const widths = [320, 375, 768, 1440];
const base=process.env.E2E_BASE_PATH||"/";

test.describe("language switcher", () => {
  for (const width of widths) for (const theme of ["light","dark"] as const) {
    test(`is usable at ${width}px under OS ${theme} with keyboard and outside dismissal`, async ({ page }) => {
      await page.addInitScript(value=>localStorage.setItem("potential-theme",value),theme);
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(base+"ru/");
      await expect(page.locator('html')).toHaveAttribute('data-theme','light');
      const trigger = page.getByRole("button", { name: "Выбрать язык" });
      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitemradio")).toHaveCount(2);
      const bounds = await menu.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitemradio").last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(menu.getByRole("menuitemradio").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.press('ArrowDown');
      await page.keyboard.press('Tab');
      await expect(menu).toBeHidden();
      await trigger.click();
      await page.mouse.click(width - 2, 500);
      await expect(menu).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test("selects Ukrainian and preserves query, hash, and locale after reload", async ({ page }) => {
    await page.goto(base+"ru/interactive/?i0m=2.75&r=50#switcher-state");
    await page.getByRole("button", { name: "Выбрать язык" }).click();
    const before=new URL(page.url());
    await page.getByRole("menuitemradio", { name: "Українська" }).click();
    await expect(page).toHaveURL(/\/uk\/interactive\//);
    const after=new URL(page.url());
    expect(after.search).toBe(before.search);
    expect(after.hash).toBe(before.hash);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
    await expect(page.getByRole("button", { name: "Вибрати мову" })).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('potential-language'))).toBe('uk');
    await page.goto(base);
    await expect(page).toHaveURL(new RegExp('/uk/$'));
    await expect(page.locator('html')).toHaveAttribute('lang','uk');
  });
});
