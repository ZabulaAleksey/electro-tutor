import { expect, test } from "@playwright/test";

const base = process.env.E2E_BASE_PATH || "/";
const destinations = [
  { language: "ru", textbook: "Учебник", labs: "Лаборатории", solutions: "Решения" },
  { language: "uk", textbook: "Підручник", labs: "Лабораторії", solutions: "Розв’язання" },
] as const;

for (const { language, textbook, labs, solutions } of destinations) {
  const home = `${base}${language}/`;
  const lesson = `${home}topics/dc/mesh-current-method/`;
  test(`${language}: global catalogues, local material, direct lab links and history`, async ({ page, request }) => {
    await page.goto(home);
    const nav = page.locator(".astro-header > nav");
    await expect(nav.getByRole("link", { name: /^(Оглавление|Зміст)$/ })).toHaveCount(0);
    await expect(page.locator("#labs [data-registered-content]")).toHaveCount(5);
    await page.locator(".site-footer").getByRole("link", { name: textbook, exact: true }).click();
    await expect(page).toHaveURL(`${home}topics/`);
    const mesh = page.locator("#topic-dc-mesh");
    await mesh.getByRole("link", { name: textbook, exact: true }).click();
    await expect(page).toHaveURL(lesson);
    await expect(page.locator(".katex").first()).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${home}topics/`);
    const ohm = page.locator("#topic-dc-ohm");
    await expect(ohm.getByRole("link", { name: textbook, exact: true })).toHaveCount(0);
    const micro = ohm.locator("a[href*='#micro=ohm-law']");
    await micro.click();
    await expect(page).toHaveURL(`${home}micro-labs/#micro=ohm-law`);
    await expect(page.locator("[data-micro='ohm-law']")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${home}topics/`);
    await page.goForward();
    await expect(page).toHaveURL(`${home}micro-labs/#micro=ohm-law`);
    await nav.getByRole("link", { name: labs, exact: true }).click();
    await expect(page).toHaveURL(`${home}interactive/`);
    const search = page.locator("#labs input[type=search]");
    await search.fill("Фур");
    await expect(page.locator("#labs a[href*='/interactive/fourier/']")).toBeVisible();
    await expect(page.locator("#labs a[href*='/interactive/beam/']")).toBeHidden();
    await search.clear();
    const labLinks = await page.locator("#labs a[data-registered-content]").evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
    expect(labLinks).toHaveLength(5);
    expect(new Set(labLinks).size).toBe(labLinks.length);
    for (const href of new Set(labLinks.map(link => link.split("#")[0]))) {
      expect((await request.get(href)).status(), href).toBe(200);
    }
    await page.locator(".site-footer").getByRole("link", { name: solutions, exact: true }).click();
    await expect(page).toHaveURL(`${home}solutions/`);
    await expect(page.locator("[data-registered-content]")).toHaveCount(4);
    await page.goto(`${home}tools/`);
    await expect(page.locator("#tools a[href*='circular-diagram/']")).toBeVisible();
    await expect(page.locator("#tools a[href*='/board/']")).toHaveCount(0);
    await expect(nav.locator("a[href$='/board/']")).toBeVisible();
    await page.locator("#tools a[href*='/engineering-board/']").click();
    await expect(page).toHaveURL(`${home}engineering-board/`);
    const calculator = page.locator(".calculator-card").first();
    await calculator.getByRole("textbox").first().fill("24");
    await expect(calculator.locator(".calculator-formula")).toContainText("0,800");
  });

  test(`${language}: light rendering at phone and desktop widths`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("potential-theme", "dark"));
    for (const width of [320, 390, 768, 900, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [home, `${home}topics/`, `${home}interactive/`, `${home}solutions/`, `${home}tools/`, lesson]) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await expect(page.locator("html")).toHaveCSS("color-scheme", "light only");
        await expect(page.locator("#theme-toggle, #mvp-theme")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width);
      }
    }
    for (const width of [390, 800, 900]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(home);
      await page.locator("#mobile-menu-toggle").click();
      await page.locator(".astro-header > nav").getByRole("link", { name: labs, exact: true }).click();
      await expect(page).toHaveURL(`${home}interactive/`);
      await expect(page.locator("#mobile-menu-toggle")).toHaveAttribute("aria-expanded", "false");
    }
  });
}

test("catalogue provides a direct experiment link without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${base}uk/topics/`);
  await page.locator("#topic-ac-three-phase a[href*='/interactive/star-neutral/']").click();
  await expect(page).toHaveURL(`${base}uk/interactive/star-neutral/`);
  await context.close();
});
