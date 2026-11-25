import { expect, test, type Locator } from "@playwright/test";

const directories = [
  { language: "ru", launch: "Запустить", ohm: "Закон Ома", drive: "Электропривод", motor: "Разгон двигателя" },
  { language: "uk", launch: "Запустити", ohm: "Закон Ома", drive: "Електропривід", motor: "Розгін двигуна" },
] as const;

for (const { language, launch, ohm, drive, motor } of directories) {
  test(`EVAL-01 ${language}: each directory card is an illustrated link to a real experiment`, async ({ page, request }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: language === "ru" ? 1440 : 390, height: 900 });
    await page.goto(`/${language}/interactive/`);
    const cards = page.locator("main [data-lab-card]");
    await expect(cards).toHaveCount(language === "ru" ? 39 : 38);
    const records = await cards.evaluateAll((links) => links.map((link) => ({
      href: (link as HTMLAnchorElement).href,
      image: link.querySelector("img")?.src,
      dimensions: !!link.querySelector("img[width][height][srcset]"),
      loading: link.querySelector("img")?.loading,
    })));
    expect(new Set(records.map(({ href }) => href)).size).toBe(records.length);
    expect(new Set(records.map(({ image }) => image)).size).toBe(records.length);
    for (const [index, { href, image, dimensions, loading }] of records.entries()) {
      expect(dimensions).toBe(true);
      expect(image).toBeTruthy();
      if (index >= 6) expect(loading).toBe("lazy");
      const destination = await request.get(href);
      expect(destination.ok(), href).toBe(true);
      const illustration = await request.get(image!);
      expect(illustration.ok(), image).toBe(true);
      expect(illustration.headers()["content-type"]).toMatch(/^image\//);
    }
    await expect(cards.locator("input, select, textarea, button, a, output, [data-micro-result], [data-science-result]")).toHaveCount(0);
    await expect(cards.getByText(launch, { exact: true })).toHaveCount(records.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: info.outputPath("catalogue.png"), animations: "disabled" });
    expect(errors).toEqual([]);
  });

  test(`EVAL-01 ${language}: filter, search, whole card and keyboard open the actual player`, async ({ page }) => {
    const catalogue = `/${language}/micro-labs/`;
    await page.goto(catalogue);
    const filter = page.locator("[data-directory-category-filter]");
    await filter.selectOption({ label: drive });
    await expect(page.locator("[data-lab-card]:visible")).toHaveCount(1);
    await expect(page.getByRole("link", { name: motor, exact: true })).toBeVisible();
    await filter.selectOption("all");
    await page.locator("[data-directory-search]").fill("ohm-law");
    await expect(page.getByRole("link", { name: ohm, exact: true })).toBeVisible();
    await page.locator("[data-directory-search]").fill(ohm);
    await expect(page.locator("[data-lab-card]:visible")).toHaveCount(1);
    await expect(page.locator("main [data-lab-card] [role=slider], main [data-lab-card] input, main [data-lab-card] output")).toHaveCount(0);
    const clickImage = (card: Locator) => card.locator("img").click();
    const clickSpacing = (card: Locator) => card.click({ position: { x: 4, y: 4 } });
    const clickAction = (card: Locator) => card.getByText(launch, { exact: true }).click();
    const pressEnter = async (card: Locator) => { await card.focus(); await card.press("Enter"); };
    for (const activate of [clickImage, clickSpacing, clickAction, pressEnter]) {
      const card = page.getByRole("link", { name: ohm, exact: true });
      await activate(card);
      await expect(page).toHaveURL(new RegExp(`/${language}/interactive/experiments/micro/ohm-law/$`));
      await expect(page.getByRole("slider")).toHaveCount(2);
      const output = page.locator('[data-micro-result="I"]');
      const old = await output.innerText();
      const voltage = page.getByRole("slider", { name: "U, V", exact: true });
      await voltage.press(await voltage.inputValue() === "48" ? "Home" : "End");
      await expect(output).not.toHaveText(old);
      await page.goto(catalogue);
    }
  });
}

test.describe("EVAL-01 without scripts", () => {
  test.use({ javaScriptEnabled: false });

  test("both legacy bookmarks stay usable as native links", async ({ page }) => {
    const bookmarkedCard = page.locator("a:target");
    await page.goto("/ru/micro-labs/#micro=ohm-law");
    await expect(bookmarkedCard).toHaveAccessibleName("Закон Ома");
    await bookmarkedCard.click();
    await expect(page).toHaveURL("/ru/interactive/experiments/micro/ohm-law/");

    await page.goto("/ru/micro-labs/#science=pendulum");
    await expect(bookmarkedCard).toHaveAccessibleName("Математический маятник");
    await bookmarkedCard.press("Enter");
    await expect(page).toHaveURL("/ru/interactive/experiments/science/pendulum/");
  });
});
