import { expect, test } from "@playwright/test";

test("interactive menu opens the RU/UK star lab", async ({ page }) => {
  await page.goto("/ru/interactive/");
  await page.getByRole("link", { name: /Открыть векторную диаграмму звезды/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Несимметричная звезда с нейтралью");
  await expect(page.locator(".star-results tbody tr")).toHaveCount(8);
  await page.locator("a[data-language-link]").click();
  await expect(page).toHaveURL(/\/uk\/interactive\/star-neutral\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Несиметрична зірка з нейтраллю");
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
  await expect(angle).toHaveValue("53.130102");
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
  await page.getByLabel("Режим нейтрали").selectOption("open");
  await expect(page.locator(".star-results tbody tr").first()).not.toContainText("0 ∠ 0°");
  await page.getByRole("button", { name: "Симметричная нагрузка", exact: true }).click();
  await expect(page.getByLabel("Режим нейтрали")).toHaveValue("ideal");
  await expect(resistance).toHaveValue("46");
  await expect(page.locator(".star-results tbody tr").first()).toContainText("0 ∠ 0°");
  expect(await page.locator(".star-impedance circle").evaluateAll(nodes =>
    nodes.map(node => node.getAttribute("r")))).toEqual(["18", "12", "6"]);
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
    await expect(page.locator(".star-results tbody tr")).toHaveCount(8);
  }
});
