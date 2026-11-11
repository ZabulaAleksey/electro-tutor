import { expect, test } from "@playwright/test";

const base = process.env.E2E_BASE_PATH || "/";
const home = base + "ru/";
const book = home + "topics/dc/mesh-current-method/";

test("public menu links to the two published catalogues and only approved mesh content", async ({ page, request }) => {
  for (const route of [home, book, book + "examples/", book + "lab/", home + "help/"]) {
    await page.goto(route);
    const menu = page.locator(".mvp-header nav");
    await expect(menu.getByRole("link")).toHaveText(["Учебник", "Лаборатории"]);
    await expect(menu.getByRole("link", { name: "Учебник", exact: true })).toHaveAttribute("href", home + "#learning-contents");
    await expect(menu.getByRole("link", { name: "Лаборатории", exact: true })).toHaveAttribute("href", home + "#labs");
  }
  await page.locator(".mvp-header nav").getByRole("link", { name: "Учебник", exact: true }).click();
  await expect(page).toHaveURL(home + "#learning-contents");
  const links = await page.locator("#learning-contents a").evaluateAll(nodes =>
    nodes.map(link => (link as HTMLAnchorElement).pathname));
  expect(links).toEqual([book + "lab/", book + "examples/", book]);
  for (const route of ["uk/", "ru/topics/", "ru/interactive/", "ru/tools/", "ru/classroom/", "ru/micro-labs/"]) {
    expect((await request.get(base + route)).status()).toBe(404);
  }
});

test("public stage rail retains the example and the global catalogue works after transitions", async ({ page }) => {
  await page.goto(book + "examples/#example-3");
  await expect(page.locator(".journey-content")).toHaveAttribute("data-gesture-ready", "true");
  await page.locator(".journey-rail [data-step='2']").click();
  await expect(page).toHaveURL(book + "lab/?example=3");
  await expect(page.getByTestId("preset")).toHaveValue("3");
  await page.goBack();
  await expect(page).toHaveURL(book + "examples/#example-3");
  await page.locator(".mvp-header nav").getByRole("link", { name: "Лаборатории", exact: true }).click();
  await expect(page).toHaveURL(home + "#labs");
  await expect(page.locator("#labs a")).toHaveAttribute("href", book + "lab/");
});

test('six-width two-theme stage rail stays below the actual header',async({browser})=>{
 for(const theme of ['light','dark'] as const){const context=await browser.newContext({colorScheme:theme,serviceWorkers:'block'}),page=await context.newPage();for(const width of [320,375,390,768,1280,1920]){await page.setViewportSize({width,height:900});await page.goto(book);await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');await page.evaluate(()=>scrollTo(0,900));const header=await page.locator('.astro-header,.mvp-header').boundingBox(),rail=await page.locator('.journey-rail').boundingBox();expect(rail!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await context.close();}
});
