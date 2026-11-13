import { expect, test } from "@playwright/test";

const book = "/ru/topics/dc/mesh-current-method/";
const textbook = "/ru/topics/";
const mesh = "#topic-dc-mesh";
const header = ".astro-header > nav";

test("the two primary links have consistent destinations on every full page", async ({ page }) => {
  for (const route of ["/ru/", textbook, "/ru/interactive/", "/ru/my-services/", book, book + "examples/", book + "lab/"]) {
    await page.goto(route);
    const menu = page.locator(header);
    await expect(page.locator(".site-footer a[href$='/topics/']")).toHaveAttribute("href", textbook);
    await expect(menu.getByRole("link", { name: "Лаборатории", exact: true })).toHaveAttribute("href", "/ru/interactive/");
    await expect(menu.getByRole("link", { name: "Интерактивная доска", exact: true })).toHaveAttribute("href", "/ru/board/");
    await expect(menu.getByRole("link")).toHaveCount(2);
    await expect(menu.getByRole("link", { name: "Оглавление", exact: true })).toHaveCount(0);
    expect(await menu.locator("[aria-current]").count()).toBeLessThanOrEqual(1);
  }
});

test("textbook search exposes real content and treats arbitrary input as text", async ({ page }) => {
  await page.goto(textbook);
  const topics = page.locator("#learning-contents");
  const search = topics.getByRole("searchbox");
  const count = await topics.locator("article:visible").count();
  expect(count).toBeGreaterThan(1);
  await search.fill("Метод контурных токов");
  await expect(topics.locator("article:visible")).toHaveCount(1);
  await expect(topics.locator(mesh).getByRole("link", { name: "Учебник", exact: true })).toHaveAttribute("href", book);
  await search.fill("<script>none</script>");
  await expect(topics.locator("[data-directory-no-results]")).toBeVisible();
  await expect(topics.locator("article:visible")).toHaveCount(0);
  await search.clear();
  await expect(topics.locator("article:visible")).toHaveCount(count);
});

test("all five featured laboratories resolve once and legacy routes still work", async ({ page, request }) => {
  const links: string[] = [];
  await page.goto("/ru/interactive/");
  links.push(...await page.locator("#labs [data-registered-content]").evaluateAll(elements =>
    elements.map(link => (link as HTMLAnchorElement).getAttribute("href")!)));
  expect(links).toHaveLength(5);
  expect(links).not.toContain("/ru/interactive/reactive-two-port/");
  expect(new Set(links).size).toBe(links.length);
  const paths = new Set<string>();
  for (const href of links) {
    const url = new URL(href, "http://local");
    paths.add(url.pathname);
    if (url.hash) expect(url.hash).toMatch(/^#(micro|science)=/);
  }
  for (const route of paths) {
    expect((await request.get(route)).status(), route).toBe(200);
    await page.goto(route);
    await expect(page.locator("h1")).not.toBeEmpty();
  }
  await page.goto("/ru/interactive/transmission-line-reference/");
  await expect(page).toHaveURL(/transmission-line-reference/);
  await page.goto("/ru/micro-labs/?learningStage=lab#micro=capacitor-charge");
  await expect(page.locator('[data-micro="capacitor-charge"]')).toHaveAttribute("data-selected", "true");
});

test("mesh stage rail preserves example context, changed value and native scroll", async ({ page }) => {
  await page.goto(book + "examples/#example-4");
  await expect(page.locator(".journey-content")).toHaveAttribute("data-gesture-ready", "true");
  await page.locator(".journey-rail [data-step='2']").click();
  await expect(page).toHaveURL(/lab\/\?example=4/);
  await expect(page.getByTestId("preset")).toHaveValue("4");
  await page.getByTestId("parameter-value").fill("3");
  await page.locator(".journey-rail [data-step='1']").click();
  await expect(page).toHaveURL(/examples\/#example-4/);
  await page.locator(".journey-rail [data-step='2']").click();
  await expect(page.getByTestId("parameter-value")).toHaveValue("3");
  await page.locator(".journey-rail").focus();
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(book);
  await page.mouse.move(180, 450);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(250);
  await expect(page).toHaveURL(book);
});

test("keyboard search works with storage denied, and native links work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    for (const key of ["localStorage", "sessionStorage"]) Object.defineProperty(window, key, { get() { throw Error("denied"); } });
  });
  const page = await context.newPage();
  await page.goto(textbook);
  const search = page.getByRole("searchbox");
  await search.focus();
  await search.pressSequentially("контур");
  await expect(page.locator(mesh)).toBeVisible();
  await context.close();

  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto("/uk/topics/");
  const topic = plain.locator(mesh);
  await expect(topic.getByRole("link", { name: "Підручник", exact: true })).toHaveAttribute("href", "/uk/topics/dc/mesh-current-method/");
  await expect(topic.locator("a[href$='/examples/'],a[href$='/lab/']")).toHaveCount(0);
  await plain.locator('a[href$="/uk/interactive/fourier/"]').click();
  await expect(plain).toHaveURL("/uk/interactive/fourier/");
  await nojs.close();
});

test("global textbook from the lab preserves native history and explicit topic destinations", async ({ page }) => {
  await page.goto(book + "lab/?example=4&reset=1");
  await expect(page.getByTestId("preset")).toHaveValue("4");
  await expect(page).toHaveURL(book + "lab/?example=4");
  await page.locator(".site-footer").getByRole("link", { name: "Учебник", exact: true }).click();
  await expect(page).toHaveURL(textbook);
  await page.locator(mesh).getByRole("link", { name: "Примеры решений", exact: true }).click();
  await expect(page).toHaveURL(book + "examples/");
  await page.reload();
  await expect(page.locator(".journey-rail [data-step='1']")).toHaveAttribute("aria-current", "step");
  await page.goBack();
  await expect(page).toHaveURL(textbook);
  await page.goBack();
  await expect(page).toHaveURL(book + "lab/?example=4");
  await page.goForward();
  await expect(page).toHaveURL(textbook);
});

test("keyboard navigation from a scrolled lesson reaches the catalogue and Back restores reading position", async ({ page }) => {
  // Measure scroll restoration against stable typography, as in the visual tests.
  await page.route("https://fonts.googleapis.com/**", route => route.abort());
  await page.goto(book);
  await page.evaluate(() => document.fonts.ready);
  const link = page.locator(".site-footer").getByRole("link", { name: "Учебник", exact: true });
  await link.focus();
  await page.evaluate(() => scrollTo({ top: 1800, behavior: "instant" }));
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(textbook);
  await expect(page.getByRole("heading", { level: 1, name: "Учебник" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(book);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(value => Math.abs(scrollY - value), before)).toBeLessThan(3);
});

test('six-width two-theme stage rail stays below the actual header',async({browser})=>{
 for(const theme of ['light','dark'] as const){const context=await browser.newContext({colorScheme:theme,serviceWorkers:'block'}),page=await context.newPage();for(const width of [320,375,390,768,1280,1920]){await page.setViewportSize({width,height:900});await page.goto(book);await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');await page.evaluate(()=>scrollTo(0,900));const header=await page.locator('.astro-header,.mvp-header').boundingBox(),rail=await page.locator('.journey-rail').boundingBox();expect(rail!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await context.close();}
});

test("mobile catalogue menu opens and closes with keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(book);
  const toggle = page.locator("#mobile-menu-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(header).getByRole("link", { name: "Лаборатории", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test('desktop menu labels remain inside the header with independent stages',async({page})=>{
 for(const width of [1280,1920]){await page.setViewportSize({width,height:900});await page.goto('/ru/');const header=await page.locator('.astro-header').boundingBox();for(const a of await page.locator('.astro-header nav a:visible, .astro-header nav > details > summary').all()){const box=await a.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(header!.y-1);expect(box!.y+box!.height).toBeLessThanOrEqual(header!.y+header!.height+1);}expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});

test("catalogue navigation and history keep a direct experiment bookmark", async ({ page }) => {
  const bookmark = "/ru/interactive/fourier/?harmonics=4";
  await page.goto(bookmark);
  await page.locator(header).getByRole("link", { name: "Лаборатории", exact: true }).click();
  await expect(page).toHaveURL("/ru/interactive/");
  await expect(page.locator("#labs a[href$='/interactive/fourier/']")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(bookmark);
  await page.goto("/ru/interactive/?i0m=2.75");
  await expect(page.locator(".circle-lab")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(bookmark);
  await page.reload();
  await expect(page).toHaveURL(bookmark);
});
