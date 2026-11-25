import { expect, test } from "@playwright/test";

test("interactive menu opens the RU/UK star lab", async ({ page }) => {
  await page.goto("/ru/interactive/");
  await page.getByRole("link", { name: "Несимметричная звезда", exact: true }).click();
  await expect(page).toHaveURL(/\/ru\/interactive\/star-neutral\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Несимметричная звезда");
  await expect(page.locator(".star-results tbody tr")).toHaveCount(11);
  await page.locator(".language-switcher__trigger").click(); await page.locator("a[data-language-link]").click();
  await expect(page).toHaveURL(/\/uk\/interactive\/star-neutral\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Несиметрична зірка");
});

test("rectangular and polar fields share one impedance without stale calculations", async ({ page }) => {
  await page.goto("/ru/interactive/star-neutral/");
  const phase = page.getByRole("group", { name: "Фаза A — ZA" });
  const resistance = phase.getByRole("spinbutton", { name: "R, Ω" });
  const reactance = phase.getByRole("spinbutton", { name: "X, Ω" });
  const magnitude = phase.getByRole("spinbutton", { name: "|Z|, Ω" });
  const angle = phase.getByRole("spinbutton", { name: "φ, °" });
  const initialCurrent = await page.locator(".star-results tbody tr").nth(4).textContent();
  await resistance.fill("30");
  await reactance.fill("40");
  await expect(magnitude).toHaveValue("50");
  await expect.poll(async () => Number(await angle.inputValue())).toBeCloseTo(Math.atan2(40, 30) * 180 / Math.PI, 4);
  await magnitude.fill("80");
  await angle.fill("60");
  await resistance.blur();
  await expect.poll(async () => Number(await resistance.inputValue())).toBeCloseTo(40, 4);
  await expect.poll(async () => Number(await reactance.inputValue())).toBeCloseTo(69.282032, 4);
  expect(await page.locator(".star-results tbody tr").nth(4).textContent()).not.toBe(initialCurrent);
});

test("drag, neutral mode and preset update the local model", async ({ page }) => {
  await page.goto("/ru/interactive/star-neutral/");
  const phase = page.getByRole("group", { name: "Фаза A — ZA" });
  const resistance = phase.getByRole("spinbutton", { name: "R, Ω" });
  const before = Number(await resistance.inputValue());
  const point = page.locator(".star-phase-a circle");
  await point.hover();
  await page.evaluate(() => window.scrollBy(0, -400));
  await point.hover();
  const box = await point.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe("circle");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, 50, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await resistance.inputValue())).not.toBe(before);
  await page.getByRole("switch").uncheck();
  await expect(page.locator(".star-results tbody tr").first()).not.toContainText("0 ∠ 0°");
  await page.getByRole("button", { name: "Симметричная нагрузка", exact: true }).click();
  await expect(page.getByRole("switch")).toBeChecked();
  await expect(resistance).toHaveValue("46");
  await expect(page.locator(".star-results tbody tr").first()).toContainText("0 ∠ 0°");
  const phases = page.locator(".star-point:not(.star-phase-n) circle");
  expect(await phases.evaluateAll(nodes => new Set(nodes.map(n => n.getAttribute("cx"))).size)).toBe(1);
  expect(await phases.evaluateAll(nodes => new Set(nodes.map(n => n.getAttribute("r"))).size)).toBe(3);
});

test("mobile star lab stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk/interactive/star-neutral/");
  await expect(page.getByRole("img", { name: "Комплексна площина Z" })).toBeVisible();
  await expect(page.locator(".star-results tbody tr").first().locator("td").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("impedance plane fits both sub-ohm and large finite data", async ({ page }) => {
  await page.goto("/ru/interactive/star-neutral/");
  await page.getByRole("button", { name: "Симметричная нагрузка", exact: true }).click();
  for (const value of ["0.001", "1000000"]) {
    for (const phase of ["A", "B", "C"]) {
      await page.getByRole("group", { name: `Фаза ${phase} — Z${phase}` })
        .getByRole("spinbutton", { name: "R, Ω" }).fill(value);
    }
    await expect.poll(async () => Number(await page.locator(".star-phase-a circle").getAttribute("cx")))
      .toBeGreaterThan(350);
    await expect(page.locator(".star-results tbody tr")).toHaveCount(11);
  }
});

test("the schematic, line voltages and partial results follow exact shorts", async ({ page }) => {
  await page.goto("/ru/interactive/star-neutral/");
  const schematic = page.locator("[data-star-schematic]");
  const phase = page.getByRole("group", { name: "Фаза A — ZA" });
  const table = page.locator(".star-results table");
  const row = (quantity: string) => table.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: quantity, exact: true }),
  });
  await page.getByRole("button", { name: "Симметричная нагрузка", exact: true }).click();
  await expect(row("IN")).toContainText("0 ∠ 0° A");
  const independent = page.getByLabel("Независимые фазоры источника");
  await independent.check();
  await expect(row("IN")).toContainText("0 ∠ 0° A");
  await independent.uncheck();
  await expect(row("UnN").locator("sub")).toHaveText("nN");
  const lineValues = await Promise.all(["UAB", "UBC", "UCA"].map(quantity => row(quantity).innerText()));
  await expect(page.locator(".star-lab table")).toHaveCount(1);
  await phase.getByRole("spinbutton", { name: "R, Ω", exact: true }).fill("0");
  await expect(schematic.locator('[data-star-branch="A"]')).toHaveAttribute("data-ideal", "true");
  await expect(schematic.locator('[data-star-impedance="A"]')).toContainText("= 0 Ω");
  await expect(page.getByRole("alert")).toContainText("Решения нет");
  await expect(row("IA").locator("td").first()).toHaveText("—");

  const neutral = page.getByRole("switch");
  await neutral.uncheck();
  await expect(schematic.locator("[data-star-neutral-branch]")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(row("Ua")).toContainText("0 ∠ 0° V");
  await expect(row("IA").locator("td").first()).not.toHaveText("—");
  expect(await Promise.all(["UAB", "UBC", "UCA"].map(quantity => row(quantity).innerText()))).toEqual(lineValues);

  await neutral.check();
  await page.getByRole("group", { name: "Нейтраль — ZN" })
    .getByRole("spinbutton", { name: "X, Ω", exact: true }).fill("12");
  await expect(schematic.locator('[data-star-impedance="N"]')).toContainText("j12 Ω");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(row("UnN")).toContainText("230 ∠ 0° V");
});

test("touch drag follows its pointer through the axis at zoom and releases on cancellation", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto("/ru/interactive/star-neutral/");
    await page.getByRole("switch").check();
    const touch = await context.newCDPSession(page);
    const field = page.getByRole("group", { name: "Нейтраль — ZN" });
    const r = field.getByRole("spinbutton", { name: "R, Ω", exact: true });
    const x = field.getByRole("spinbutton", { name: "X, Ω", exact: true });
    const plane = page.locator(".star-impedance svg");
    await plane.evaluate(async svg => {
      await document.fonts.ready;
      document.documentElement.style.zoom = "1.15";
      svg.scrollIntoView({ block: "center", behavior: "instant" });
    });
    const point = page.locator(".star-phase-n circle");
    const box = (await point.boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const scroll = await page.evaluate(() => window.scrollY);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    // A late page layout adjustment changes the SVG screen origin during capture.
    // The pointer stays in viewport coordinates while the graph retains its Ω/unit scale.
    await plane.evaluate(svg => { svg.style.translate = "0 2px"; });
    for (const dx of [8, 16, 24]) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + dx, y: start.y + dx }] });
      await expect.poll(async () => {
        const actual = (await point.boundingBox())!;
        return Math.hypot(actual.x + actual.width / 2 - start.x - dx, actual.y + actual.height / 2 - start.y - dx);
      }).toBeLessThan(0.5);
    }
    expect(Number(await x.inputValue())).toBeLessThan(0);
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x - 5, y: start.y - 12 }] });
    await expect(r).toHaveValue("0");
    expect(Number(await x.inputValue())).toBeGreaterThan(0);
    await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    await page.getByRole("switch").uncheck();
    await expect(point).toHaveCount(0);
  } finally {
    await context.close();
  }
});
