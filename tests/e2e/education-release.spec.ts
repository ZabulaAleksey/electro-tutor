import { expect, test } from "@playwright/test";
import { restrictedEducationPaths } from "../../scripts/education-routes.mjs";

const base = process.env.E2E_BASE_PATH || "/";
const at = (path: string) => (process.env.EDUCATION_ORIGIN || "") + base + path.replace(/^\//, "");

test("published study sections are bilingual and reserved services stay unavailable", async ({ request, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const restricted = restrictedEducationPaths.flatMap(path => [path, path + "/", path + "/index.html?release-check=1"]);
  for (const path of restricted) {
    const response = await request.get(at(path), { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    if (process.env.E2E_RELEASE_HEADERS === "1") {
      expect(await response.text(), path).toContain('content="noindex"');
      expect(response.headers()["cache-control"], path).toContain("no-store");
    }
  }
  for (const language of ["ru", "uk"]) {
    for (const path of ["", "topics/", "solutions/", "interactive/", "help/", "contacts/", "privacy/"]) {
      const route = `${language}/${path}`;
      const response = await request.get(at(route));
      expect(response.status(), route).toBe(200);
      expect(await response.text(), route).toMatch(new RegExp(`<html lang="${language}" data-theme="light"`));
      if (process.env.E2E_RELEASE_HEADERS === "1") {
        const policy = response.headers()["content-security-policy"];
        expect(policy, route).toContain("frame-ancestors 'none'");
        expect(policy, route).toContain("connect-src 'self'");
        expect(policy, route).toContain("'wasm-unsafe-eval'");
      }
    }
    await page.goto(at(language + "/"));
    await expect(page.locator(".editorial-section a")).toHaveCount(3);
    await page.locator("#mobile-menu-toggle").click();
    await page.locator(".astro-header nav a[href$='/solutions/']").click();
    await expect(page).toHaveURL(new RegExp(`/${language}/solutions/$`));
    await expect(page.locator("main [data-registered-content]")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test("public lessons and real WASM recalculate online and offline with no account requests", async ({ page, context }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  const accountRequests: string[] = [];
  page.on("console", message => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  page.on("request", request => {
    if (/\/(api|auth)\//.test(new URL(request.url()).pathname)) accountRequests.push(request.url());
  });
  const lesson = at("ru/topics/dc/mesh-current-method/");
  const restricted = at("ru/account/");
  await page.goto(at("robots.txt"));
  await page.evaluate(async restricted => {
    const legacy = await caches.open("potential-pwa-v2");
    await legacy.put(new URL(restricted, location.href).href, new Response("legacy private page fixture"));
    const unrelated = await caches.open("unrelated-preview-test");
    await unrelated.put(new URL("keep", location.href).href, new Response("keep"));
  }, restricted);
  await page.goto(lesson);
  await expect(page.locator(".katex").first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(await page.evaluate(async restricted => ({
    legacy: await caches.has("potential-pwa-v2"),
    restricted: Boolean(await caches.match(new URL(restricted, location.href).href)),
    unrelated: await caches.has("unrelated-preview-test"),
  }), restricted)).toEqual({ legacy: false, restricted: false, unrelated: true });
  await page.reload();
  await expect(page.locator(".katex").first()).toBeVisible();
  const lab = at("uk/interactive/transmission-line/");
  await page.goto(lab);
  const surface = page.locator("[data-network-lab]");
  await expect(surface).toHaveAttribute("data-calculation-ready", "true");
  await expect(page.locator(".network-plot-grid [data-engineering-plot]")).toHaveCount(4);
  await page.locator("[data-network-canvas]").getByRole("button",{name:"Джерело",exact:true}).press("Enter");
  await page.getByRole("spinbutton", { name: "E, V", exact: true }).fill("120");
  await expect(surface).toHaveAttribute("data-calculation-ready", "true");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(surface).toHaveAttribute("data-calculation-ready", "true");
  await page.goto(lesson, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".katex").first()).toBeVisible();
  expect(violations).toEqual([]);
  expect(accountRequests).toEqual([]);
});
