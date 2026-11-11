import { expect, test } from "@playwright/test";

const home = `${process.env.E2E_BASE_PATH || "/"}ru/`;
const lesson = `${home}topics/dc/mesh-current-method/`;

test("published RU catalogues reach theory, examples and a working lab under dark OS settings", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("potential-theme", "dark"));
  await page.goto(home);
  const nav = page.locator(".mvp-header nav");
  await expect(nav.getByRole("link")).toHaveText(["Учебник", "Лаборатории"]);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await nav.getByRole("link", { name: "Лаборатории", exact: true }).click();
  await expect(page).toHaveURL(`${home}#labs`);
  await page.locator("#labs a").first().click();
  await expect(page).toHaveURL(`${lesson}lab/`);
  await expect(page.locator(".mesh-lab")).toHaveAttribute("data-ready", "true");
  await page.getByTestId("parameter-value").fill("5");
  await expect(page.getByTestId("parameter-value")).toHaveValue("5");
  await page.goBack();
  await expect(page).toHaveURL(`${home}#labs`);
  await nav.getByRole("link", { name: "Учебник", exact: true }).click();
  await expect(page).toHaveURL(`${home}#learning-contents`);
  await expect(page.locator("#topic-dc-mesh a[href$='/examples/']")).toBeVisible();
  await page.locator("#topic-dc-mesh").getByRole("link", { name: "Учебник", exact: true }).click();
  await expect(page).toHaveURL(lesson);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
