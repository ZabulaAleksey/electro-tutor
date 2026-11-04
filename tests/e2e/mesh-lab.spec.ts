import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type FixtureData from "../../src/models/mesh-reference.json";
const fixtures: typeof FixtureData = JSON.parse(readFileSync(new URL("../../src/models/mesh-reference.json", import.meta.url), "utf8"));
const route = "/ru/topics/dc/mesh-current-method/lab/";
const human = (v: number) => (Object.is(v, -0) ? 0 : v).toPrecision(3).replace(".", ",");
async function ready(page: Page, example = 1) { await page.goto(`${route}?example=${example}`); await expect(page.locator(".mesh-lab")).toHaveAttribute("data-ready", "true"); await expect(page.getByTestId("preset")).toHaveValue(String(example)); }
async function edit(page: Page, key: string, value: string | number) { await page.getByTestId("parameter").selectOption(key); await page.getByTestId("parameter-value").fill(String(value)); }
async function readings(page: Page, f: typeof fixtures[number]) {
  for (const key of ["mesh", "branch"] as const) for (const [k, v] of f.expected[key].entries()) await expect(page.getByTestId(`${key}-${k + 1}`)).toHaveText(`${human(v)} A`);
  for (const [k, v] of f.expected.voltages.entries()) await expect(page.getByTestId(`voltage-${k + 1}`)).toHaveText(`${human(v)} V`);
  await expect(page.getByTestId("power-summary")).toHaveText(`${human(f.expected.generated)} W / ${human(f.expected.absorbed)} W`);
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.locator(".katex-error")).toHaveCount(0);
}
for (const example of [1, 2, 3, 4]) test(`RUN3D real browser example${example}: published and three independently checked modified circuits`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await ready(page, example);
  await page.evaluate(() => Object.assign(window, { meshNavigationProbe: "same-document" }));
  for (const f of fixtures.filter(v => v.input.example === example)) {
    for (const [k, v] of f.input.r.entries()) await edit(page, `R${k + 1}`, v);
    for (const [k, v] of f.input.emf.entries()) await edit(page, `E${k + 1}`, v);
    if (example === 4) await edit(page, "J", f.input.current);
    await readings(page, f); expect(await page.evaluate(() => (window as Window & { meshNavigationProbe?: string }).meshNavigationProbe)).toBe("same-document");
  }
  await page.getByRole("button", { name: "Сброс параметров", exact: true }).click(); await readings(page, fixtures.find(v => v.name === `example${example}-published`)!); expect(errors).toEqual([]);
});
test("RUN3D textbook→examples→lab keeps the selected example and returns to its solution", async ({ page }) => {
  await page.goto("/ru/topics/dc/mesh-current-method/"); await page.getByRole("link", { name: "Перейти к подробным примерам решений →", exact: true }).click(); await page.getByRole("link", { name: "Открыть в лаборатории пример 4 →", exact: true }).click();
  await expect(page.getByTestId("preset")).toHaveValue("4"); await expect(page.getByTestId("mesh-1")).toHaveText("2,67 A"); await page.reload(); await expect(page.getByTestId("preset")).toHaveValue("4");
  await page.getByRole("link", { name: "Исходный пример №4 ↗", exact: true }).click(); await expect(page).toHaveURL(/examples\/#example-4$/); await expect(page.locator("#example-4 h2")).toBeInViewport();
});
test("RUN3D source reversal updates physical polarity/current direction and signed source power", async ({ page }) => {
  await ready(page, 2); await expect(page.getByTestId("branch-3")).toHaveText("-3,60 A"); await edit(page, "E2", 24); await page.getByTestId("reverse").click(); await expect(page.getByTestId("parameter-value")).toHaveValue("-24"); await expect(page.locator('[data-element="E2"] text').first()).toHaveText("−"); await expect(page.getByTestId("mesh-2")).toHaveText("6,00 A");
  await page.getByTestId("preset").selectOption("4"); await edit(page, "J", 1); await page.getByTestId("reverse").click(); await expect(page.locator('[data-current-direction]')).toHaveAttribute("data-current-direction", "B-to-A"); await expect(page.getByTestId("mesh-1")).toHaveText("1,33 A"); await expect(page.locator('[data-source="J"] td').last()).toHaveText("-9,33");
});
test("RUN3D invalid drafts, inconsistent and underdetermined circuits suppress stale results and recover", async ({ page }) => {
  await ready(page);
  for (const value of ["", "abc", "Infinity", "1e309", "-2", "0.0001", "1000001"]) { await edit(page, "R1", value); await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByTestId("branch-1")).toHaveText("—"); await expect(page.locator(".mesh-lab table")).toHaveCount(0); }
  for (const example of [1, 2, 3, 4]) {
    await page.getByTestId("preset").selectOption(String(example));
    for (let k = 1; k <= (example === 3 ? 4 : example === 4 ? 2 : 3); k++) await edit(page, `R${k}`, 0);
    await expect(page.getByRole("alert")).toHaveAttribute("data-code", "inconsistent"); await expect(page.getByTestId("mesh-1")).toHaveText("—");
    for (let k = 1; k <= (example === 2 || example === 3 ? 2 : 1); k++) await edit(page, `E${k}`, 0);
    await expect(page.getByRole("alert")).toHaveAttribute("data-code", "underdetermined");
    await page.getByRole("button", { name: "Сброс параметров", exact: true }).click(); await readings(page, fixtures.find(v => v.name === `example${example}-published`)!);
  }
  await page.getByTestId("preset").selectOption("1"); await edit(page, "R3", 0); await expect(page.getByTestId("mesh-1")).toHaveText("6,00 A"); await expect(page.getByTestId("mesh-2")).toHaveText("0,00 A"); await expect(page.getByRole("alert")).toHaveCount(0);
});
test("RUN3D keyboard, touch controls and no-JS baseline are honest; unknown query is explicit", async ({ page, browser, baseURL }) => {
  await ready(page); await page.getByTestId("parameter-value").focus(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type("4"); await expect(page.getByTestId("mesh-1")).toHaveText("2,25 A");
  await page.getByRole("button", { name: "Выделить контур I2", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.locator('[data-mesh-current="2"]')).toHaveClass(/mesh-selected-loop/);
  const touch = await browser.newContext({ baseURL, viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true });
  try { const p = await touch.newPage(); await ready(p); await p.getByTestId("parameter-value").tap(); await p.getByTestId("parameter-value").fill("4"); await expect(p.getByTestId("mesh-1")).toHaveText("2,25 A"); await p.getByRole("button", { name: "Сброс параметров", exact: true }).tap(); await expect(p.getByTestId("mesh-1")).toHaveText("3,60 A"); } finally { await touch.close(); }
  const nojs = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try { const p = await nojs.newPage(); await p.goto(route); await expect(p.getByTestId("parameter-value")).toBeDisabled(); await expect(p.getByTestId("preset")).toBeDisabled(); await expect(p.getByTestId("mesh-1")).toHaveText("3,60 A"); await expect(p.locator(".mesh-nojs")).toContainText("Без JavaScript"); await expect(p.locator("link[hreflang='uk'],a[data-language-link]")).toHaveCount(0); } finally { await nojs.close(); }
  await page.goto(`${route}?example=invalid`); await expect(page.locator(".mesh-lab")).toHaveAttribute("data-ready", "true"); await expect(page.getByRole("status").first()).toContainText("Неизвестный пример");
});
for (const width of [320, 375, 390, 768, 1280, 1920]) for (const theme of ["light", "dark"] as const) test(`RUN3D ${width}px ${theme}: adjacent controls and physical schemes`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" }); await page.route("https://fonts.googleapis.com/**", route => route.abort()); await ready(page); await page.evaluate(() => document.fonts.ready);
  const style = await page.addStyleTag({ content: "html{scroll-behavior:auto!important;overflow-anchor:none!important}.astro-header{visibility:hidden!important}" });
  try { for (const example of [1, 2, 3, 4]) {
    await page.getByTestId("preset").selectOption(String(example)); await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }); await page.getByTestId("workbench").evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY - 90));
    const layout = await page.evaluate(() => { const s = document.querySelector("svg.mesh-lab-scheme") as SVGSVGElement, a = s.getScreenCTM()!.a, labels = [...s.querySelectorAll("text")].map(t => ({ text: t.textContent, box: t.getBBox(), font: parseFloat(getComputedStyle(t).fontSize) * a })), overlap: string[] = []; for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const x = labels[i].box, y = labels[j].box; if (Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x) > 1 && Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y) > 1) overlap.push(`${labels[i].text}/${labels[j].text}`); } return { width: document.documentElement.scrollWidth, minFont: Math.min(...labels.map(x => x.font)), overlap, outside: labels.filter(({ box: b }) => b.x < 0 || b.y < 0 || b.x + b.width > 360 || b.y + b.height > 300).map(x => x.text) }; });
    expect(layout.width).toBeLessThanOrEqual(width); expect(layout.minFont).toBeGreaterThanOrEqual(12); expect(layout.overlap).toEqual([]); expect(layout.outside).toEqual([]);
    for (const loc of [page.getByTestId("parameter-value"), page.locator("svg.mesh-lab-scheme"), page.getByTestId("live-readings")]) { const b = await loc.boundingBox(); expect(b!.y).toBeGreaterThanOrEqual(76); expect(b!.y + b!.height).toBeLessThanOrEqual(900); }
    for (const [part, region] of [["workbench", page.getByTestId("workbench")], ["matrix", page.locator(".mesh-math-scroll").first()], ["power", page.locator(".mesh-lab table")]] as const) { const image = await region.screenshot({ animations: "disabled" }); await testInfo.attach(`${part}${example}-${width}-${theme}`, { body: image, contentType: "image/png" }); if (process.platform === "win32" && process.env.RUN3D_ASSERTIONS_ONLY !== "1") await expect(region).toHaveScreenshot(`${part}${example}-${width}-${theme}.png`, { animations: "disabled" }); }
    await page.getByTestId("workbench").evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY - 90));
    await edit(page, "R1", example === 3 ? 3 : 4); await expect(page.getByRole("alert")).toHaveCount(0); const input = await page.getByTestId("parameter-value").boundingBox(), output = await page.getByTestId("mesh-1").boundingBox(); expect(input!.y).toBeGreaterThanOrEqual(76); expect(output!.y + output!.height).toBeLessThanOrEqual(900);
  }} finally { await style.evaluate(e => e.parentNode?.removeChild(e)); }
});
