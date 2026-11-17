import { expect, test } from "@playwright/test";

test("selects a real coordinate, updates both phasor diagrams, and recalculates the accepted editor graph", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  await page.getByRole("link", { name: "Синусоидальный режим", exact: true }).click();
  const lab = page.locator("[data-steady-line]");
  await expect(lab).toHaveAttribute("data-ready", "true");
  const voltage = lab.getByRole("img", { name: "U(x)", exact: true });
  const current = lab.getByRole("img", { name: "I(x)", exact: true });
  const voltageVectors = lab.getByRole("img", { name: "Векторы напряжения", exact: true }).locator("..");
  const currentVectors = lab.getByRole("img", { name: "Векторы тока", exact: true }).locator("..");
  const magnitude = (label: "forward" | "backward" | "total") => voltageVectors
    .locator('[data-wave-reading="' + label + '"]').getAttribute("data-wave-magnitude").then(Number);
  const forward = await magnitude("forward"), backward = await magnitude("backward"), initial = await magnitude("total");
  expect(forward).toBeCloseTo(50, 8);
  expect(backward).toBeCloseTo(50 / 3, 8);
  expect(initial).toBeCloseTo(100 / 3, 8);

  await page.evaluate(() => document.fonts.ready);
  await current.scrollIntoViewIfNeeded();
  const target = await current.evaluate(node => {
    const svg = node as SVGSVGElement;
    const point = new DOMPoint(62 + .64 * 342, 100).matrixTransform(svg.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => Number(await lab.getAttribute("data-coordinate"))).toBeGreaterThan(250000);
  const position = await lab.getAttribute("data-coordinate");
  expect(Number(position)).toBeLessThan(400000);
  await expect(voltage.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", position!);
  await expect(current.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", position!);
  await expect(voltageVectors.locator("[data-wave-vector]")).toHaveCount(3);
  await expect(currentVectors.locator("[data-wave-vector]")).toHaveCount(3);
  expect(await magnitude("forward")).toBeCloseTo(forward, 8);
  expect(await magnitude("backward")).toBeCloseTo(backward, 8);
  expect(await magnitude("total")).toBeGreaterThan(initial);

  await voltage.press("End");
  await expect(lab).toHaveAttribute("data-coordinate", "500000");
  expect(await magnitude("total")).toBeCloseTo(200 / 3, 8);
  await lab.getByRole("combobox", { name: "Окончание", exact: true }).selectOption("matched");
  expect(await magnitude("backward")).toBeCloseTo(0, 8);
  await expect(voltageVectors.locator('[data-wave-reading="backward"]')).toHaveAttribute("data-wave-phase", "");

  await lab.getByRole("combobox", { name: "Окончание", exact: true }).selectOption("circuit");
  await voltage.press("Home");
  await lab.getByText("Схема опыта", { exact: true }).click();
  const editor = lab.locator("[data-circuit-editor]");
  await editor.getByLabel("Выбрать", { exact: true }).selectOption("R1");
  const resistance = editor.getByRole("spinbutton", { name: "Номинал", exact: true });
  await resistance.fill("150");
  await resistance.press("Enter");
  await editor.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect.poll(() => magnitude("total")).toBeCloseTo(25, 8);

  await editor.getByRole("button", { name: "Пример RLC" }).click();
  await editor.getByRole("button", { name: "Рассчитать эту схему", exact: true }).click();
  await expect(lab.getByRole("alert")).toContainText("Нужны источник ЭДС");
  expect(await magnitude("total")).toBeCloseTo(25, 8);
});

test("exposes the same laboratory in Ukrainian without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/uk/interactive/transmission-line-steady/");
  const lab = page.locator("[data-steady-line]");
  await expect(lab).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("heading", { name: "Довга лінія в синусоїдному режимі", exact: true })).toBeVisible();
  await expect(lab.getByRole("img", { name: "Вектори напруги", exact: true })).toBeVisible();
  await expect(lab.getByRole("img", { name: "Вектори струму", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await lab.getByRole("img", { name: "I(x)", exact: true }).press("End");
  await expect(lab).toHaveAttribute("data-coordinate", "500000");
});
