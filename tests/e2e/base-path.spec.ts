import { expect, test } from "@playwright/test";

const rawBasePath = process.env.E2E_BASE_PATH || "/";
const basePath = rawBasePath === "/" ? "/" : `/${rawBasePath.split("/").filter(Boolean).join("/")}/`;
const atBase = (path = "") => `${basePath === "/" ? "/" : basePath}${path.replace(/^\/+/, "")}`;

test("base root redirects to the localized home and serves public assets", async ({ page, request }) => {
  await page.goto(atBase());
  await expect(page).toHaveURL(new RegExp(`${atBase("ru/").replaceAll("/", "\\/")}$`));
  for (const asset of ["manifest.webmanifest", "icons/potential.svg", "scripts/web-font.js", "sw.js", "offline.html"]) {
    const response = await request.get(atBase(asset));
    expect(response.ok(), asset).toBe(true);
  }
});

test("base deployment opens nested lesson and returns a real 404", async ({ page, request }) => {
  const response = await page.goto(atBase("ru/topics/dc/mesh-current-method/"));
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Метод контурных токов" })).toBeVisible();
  expect((await request.get(atBase("ru/not-a-real-page/"))).status()).toBe(404);
});

test("base-aware locale switch preserves interactive query and hash", async ({ page }) => {
  await page.goto(atBase("ru/interactive/?i0m=2.75&r=50#base-state"));
  await page.locator("a[data-language-link]").click();
  await expect(page).toHaveURL(new RegExp(`${atBase("uk/interactive/").replaceAll("/", "\\/")}`));
  const target = new URL(page.url());
  expect(target.pathname).toBe(atBase("uk/interactive/"));
  expect(target.searchParams.get("i0m")).toBe("2.75");
  expect(target.hash).toBe("#base-state");
  await page.reload();
  await expect(page.locator(".circle-readout")).toContainText("2.75");
});

test("service worker is registered inside the configured base scope", async ({ page }) => {
  await page.goto(atBase("ru/"));
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    return { scope: ready.scope, scriptURL: ready.active?.scriptURL ?? "" };
  });
  expect(new URL(registration.scope).pathname).toBe(atBase());
  expect(new URL(registration.scriptURL).pathname).toBe(atBase("sw.js"));
});
