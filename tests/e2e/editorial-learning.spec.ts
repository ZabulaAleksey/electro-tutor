import { expect, test } from "@playwright/test";
import { experimentPath, experiments } from "../../src/learning/experiment-routes";

const base = process.env.E2E_BASE_PATH || "/";

for (const language of ["ru", "uk"] as const) {
  const home = `${base}${language}/`;
  test(`${language}: the landing is responsive, illustrated and links directly to the five laboratories`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(home);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      const expected = ["star-neutral", "transmission-line", "beam", "fourier", "circular-diagram"]
        .map(slug => home + "interactive/" + slug + "/");
      const cards = page.locator("#labs [data-directory-entry]");
      await expect(cards).toHaveCount(5);
      expect(await cards.locator("a").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(expected);
      expect(await page.locator(".astro-header > nav > a").evaluateAll(links => links.map(link => link.getAttribute("href"))))
        .toEqual([home + "interactive/", home + "board/"]);
      await expect(page.locator(".site-footer").locator('a[href$="/topics/"], a[href$="/solutions/"]')).toHaveCount(2);
      const images = await page.locator("main img").all();
      for (const image of images) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 390 || width === 1440) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: info.outputPath(`landing-${language}-${width}.png`), fullPage: true });
      }
    }
  });

  test(`${language}: every registered URL opens and all standalone models respond to input`, async ({ page, request }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const destinations = new Set<string>();
    for (const section of ["topics/", "solutions/", "interactive/"]) {
      await page.goto(home + section);
      const links = await page.locator("[data-registered-content]").evaluateAll(elements =>
        elements.map(element => (element as HTMLAnchorElement).href));
      expect(links.length, section).toBeGreaterThan(0);
      for (const href of links) destinations.add(href);
    }

    const origin = new URL(page.url()).origin;
    for (const { family, model } of experiments) {
      destinations.add(origin + home + experimentPath(family, model.id).slice(1));
    }

    let standaloneCount = 0;
    for (const href of destinations) {
      const url = new URL(href);
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      if (url.hash) expect(await response.text(), href).toContain(`id="${url.hash.slice(1)}"`);
      if (!url.pathname.includes("/interactive/experiments/")) continue;
      standaloneCount++;
      await page.goto(href);
      await expect(page.locator("main h1")).toBeVisible();
      const card = page.locator("main [data-micro], main [data-science-id]");
      await expect(card).toHaveCount(1);
      const result = card.locator(".micro-results, .science-results");
      const before = await result.innerText();
      const slider = card.locator("input[type=range]").first();
      await expect(slider).toBeEnabled();
      const key = await slider.evaluate((element: HTMLInputElement) => element.value === element.max ? "Home" : "End");
      await slider.press(key);
      await expect(result, href).not.toHaveText(before);
      await expect(page.locator(".katex-error")).toHaveCount(0);
    }
    expect(standaloneCount).toBe(26);
    expect(errors).toEqual([]);
  });
}

test("old home bookmarks keep their destinations and UK solutions identify Russian source material", async ({ page, browser }) => {
  await page.goto(base + "ru/?from=bookmark#story=dc-series");
  await expect(page).toHaveURL(base + "ru/showcase/?from=bookmark#story=dc-series");
  await expect(page.locator("[data-scene='dc-series']")).toBeVisible();
  await expect(page.locator(".lab-scene-title")).toBeInViewport();
  await page.goto(base + "uk/#micro=ohm-law");
  await expect(page).toHaveURL(base + "uk/micro-labs/#micro=ohm-law");
  await expect(page.locator("[data-micro='ohm-law']")).toHaveAttribute("data-selected", "true");
  await page.goto(base + "ru/#learning-contents");
  await expect(page).toHaveURL(base + "ru/topics/");
  await page.goto(base + "uk/solutions/");
  await expect(page.getByText("Розбір російською", { exact: true })).toHaveCount(4);
  await page.locator("main [data-registered-content]").first().click();
  await expect(page).toHaveURL(base + "ru/topics/dc/mesh-current-method/examples/#example-1");
  await expect(page.locator("#example-1 .katex").first()).toBeVisible();

  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await context.newPage();
  await staticPage.goto(base + "uk/");
  const links = staticPage.locator(".astro-header > nav > a");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toBeVisible();
  await links.nth(1).click();
  await expect(staticPage).toHaveURL(base + "uk/board/");
  await expect(staticPage.locator(".board-canvas g > :not(.board-preview):not(.board-eraser-preview)")).toHaveCount(0);
  await context.close();
});
