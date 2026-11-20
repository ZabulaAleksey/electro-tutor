import { expect, test } from "@playwright/test";

test("discovers the four electrical laboratories through the public directory", async ({ page }) => {
  const laboratories = [
    ["transmission-line", '[data-network-lab][data-calculation-ready="true"]'],
    ["transmission-line-steady", '[data-steady-line][data-ready="true"]'],
    ["reactive-two-port-graph", '[data-lc-graph-ready="true"]'],
    ["power-system", '[data-power-ready="true"]'],
  ];
  for (const language of ["ru", "uk"]) {
    for (const [slug, ready] of laboratories) {
      await page.goto(`/${language}/interactive/`);
      await page.locator(`main a[href="/${language}/interactive/${slug}/"]`).click();
      await expect(page).toHaveURL(`/${language}/interactive/${slug}/`);
      await expect(page.locator(ready)).toBeVisible();
    }
  }
});
