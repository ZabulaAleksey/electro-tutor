import { expect, test } from "@playwright/test";

test("home uses the shared student shell and three editorial section links", async ({ page }) => {
  await page.goto("/ru/");
  const header = page.locator(".astro-header");
  await expect(header.getByRole("link", { name: "Лаборатории", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Расчёт", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Доска", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Контакты" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Услуги", exact: true })).toHaveCount(0);
  await expect(page.locator(".lab-formats, [data-learning-summary], .panorama-slide, #labs")).toHaveCount(0);
  const sections = page.locator(".editorial-section a");
  await expect(sections).toHaveCount(3);
  await page.reload();
  await expect(sections).toHaveCount(3);
});

test("laboratory catalogue keeps real tool links and honest services state", async ({ page }) => {
  await page.goto("/ru/interactive/");
  await expect(page.getByRole("heading", { name: "Лаборатории", exact: true })).toBeVisible();
  await expect(page.locator("#labs [data-directory-entry]")).toHaveCount(35);
  expect(await page.locator("h1").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(44);
  await expect(page.locator("#labs a[href$='/interactive/star-neutral/']")).toBeVisible();
  await expect(page.locator("#labs a[data-registered-content][href$='/board/']")).toBeVisible();
  await page.goto("/ru/my-services/");
  await expect(page.getByRole("heading", { name: "Дополнительные сервисы", exact: true })).toBeVisible();
  await expect(page.locator("#mathmorph").locator("..")).toContainText("Сервис пока не подключён.");
});

test("laboratory catalogue opens the actual selected electrical model", async ({ page }) => {
  await page.goto("/ru/");
  await page.locator(".editorial-section a[href$='/interactive/']").click();
  const link = page.locator("#labs a[data-registered-content][href*='/experiments/micro/']").first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  const id = new URL(href, "http://test").pathname.split("/").filter(Boolean).at(-1);
  await link.click();
  const card = page.locator(`[data-micro="${id}"]`);
  await expect(card).toHaveAttribute("data-selected", "true");
  await expect(page.locator(".micro-card[data-selected='true']")).toHaveCount(1);
  const value = await card.locator(".micro-results").textContent();
  const slider = card.locator("input[type=range]").first();
  await expect(slider).toBeEnabled();
  await slider.press("End");
  await expect(card.locator(".micro-results")).not.toHaveText(value!);
});

test("catalogue links fit on a phone and remain stable under either OS appearance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lang of ["ru", "uk"]) {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/${lang}/interactive/`);
    const links = page.locator("#labs a[data-registered-content]");
    const before = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
    expect(before).toHaveLength(lang === "ru" ? 35 : 34);
    expect(new Set(before).size).toBe(before.length);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});
