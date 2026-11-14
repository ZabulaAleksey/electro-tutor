import { expect, test, type Page } from "@playwright/test";

const route = "/ru/interactive/circuit-editor/";
const editor = (page: Page) => page.locator("[data-circuit-editor]");
const board = (page: Page) => editor(page).locator("svg[data-circuit-board]");
const component = (page: Page) => board(page).locator("[data-component-id]");

test("places, moves, rotates, zooms and deletes a component in a blank workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "Редактор схем" })).toBeVisible();
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Резистор", exact: true }).click();
  await board(page).click({ position: { x: 160, y: 140 } });
  await expect(component(page)).toHaveCount(1);
  await expect(component(page)).toHaveAttribute("data-component-id", "R1");
  const initial = await component(page).getAttribute("transform");
  const box = await component(page).boundingBox();
  if (!box) throw Error("Missing component bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(component(page)).not.toHaveAttribute("transform", initial!);
  await page.getByRole("button", { name: "Повернуть" }).click();
  await expect(component(page)).toHaveAttribute("data-rotation", "90");
  await page.getByRole("button", { name: "Увеличить" }).click();
  await expect(board(page)).toHaveAttribute("data-zoom", "1.25");
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(component(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("localized narrow touch workspace", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("places a capacitor with a tap without causing document overflow", async ({ page }) => {
    await page.goto("/uk/interactive/circuit-editor/");
    await expect(page.getByRole("heading", { name: "Редактор схем" })).toBeVisible();
    await expect(editor(page)).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Конденсатор", exact: true }).tap();
    await board(page).tap({ position: { x: 180, y: 140 } });
    await expect(component(page)).toHaveAttribute("data-component-id", "C1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test("connects named terminals and a junction without changing the net during rotation", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  const at = async (x: number, y: number) => {
    const bounds = await board(page).boundingBox();
    if (!bounds) throw Error("Missing workspace bounds");
    await board(page).click({ position: { x: bounds.width * x / 540, y: bounds.height * y / 360 } });
  };
  await page.getByRole("button", { name: "Резистор", exact: true }).click();
  await at(90, 120);
  await page.getByRole("button", { name: "Конденсатор", exact: true }).click();
  await at(450, 120);
  await page.getByRole("button", { name: "Узел", exact: true }).click();
  await at(270, 120);
  await page.getByRole("button", { name: "Провод", exact: true }).click();
  const pin = (id: string) => board(page).locator('[data-circuit-terminal="' + id + '"]');
  await pin("R1:b").click();
  await pin("J1").click();
  await pin("J1").click();
  await pin("C1:a").click();
  await expect(board(page).locator("polyline")).toHaveCount(2);
  const viewport = editor(page).locator("[data-circuit-nets]");
  const before = await viewport.getAttribute("data-circuit-nets");
  expect(JSON.parse(before!)).toContainEqual(["C1:a", "J1", "R1:b"]);
  await page.getByRole("button", { name: "Выбрать", exact: true }).click();
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("R1");
  await page.getByRole("button", { name: "Повернуть" }).click();
  await expect(component(page).first()).toHaveAttribute("data-rotation", "90");
  await expect(viewport).toHaveAttribute("data-circuit-nets", before!);
  await expect(board(page).locator("polyline")).toHaveCount(2);
});

test("optimizes a real example and restores both geometry and topology after clearing", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример RLC" }).click();
  const wires = board(page).locator("[data-circuit-wire]");
  await expect(wires).toHaveCount(4);
  const viewport = editor(page).locator("[data-circuit-nets]");
  const nets = await viewport.getAttribute("data-circuit-nets");
  await page.getByRole("button", { name: "Оптимизировать провода" }).click();
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
  const paths = await wires.evaluateAll(items => items.map(item => item.getAttribute("points")).sort());
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Очистить поле" }).click();
  await expect(wires).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
  expect(await wires.evaluateAll(items => items.map(item => item.getAttribute("points")).sort())).toEqual(paths);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(wires).toHaveCount(0);
});

test("inserts a diode into an RLC wire and changes a resistor value", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример RLC" }).click();
  const viewport = editor(page).locator("[data-circuit-nets]");
  const original = await viewport.getAttribute("data-circuit-nets");
  await page.getByRole("button", { name: "Диод", exact: true }).click();
  const coordinates = await board(page).evaluate(svg => {
    const frame = (svg as unknown as SVGSVGElement).getScreenCTM()!;
    const point = new DOMPoint(270, 90).matrixTransform(frame);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(coordinates.x, coordinates.y);
  await expect(board(page).locator('[data-component-id="D1"]')).toBeVisible();
  const edited = await viewport.getAttribute("data-circuit-nets");
  expect(JSON.parse(edited!)).toContainEqual(["D1:b", "L1:a"]);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-circuit-nets", original!);
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("R1");
  const input = page.getByRole("spinbutton", { name: "Номинал" });
  await input.fill("220");
  await input.press("Enter");
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("L1");
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("R1");
  await expect(input).toHaveValue("220");
});

test("saves across reload, exports JSON, and rejects malformed import atomically", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример RLC" }).click();
  const viewport = editor(page).locator("[data-circuit-nets]");
  const nets = await viewport.getAttribute("data-circuit-nets");
  await page.getByRole("button", { name: "Сохранить в браузере" }).click();
  await expect(page.getByRole("status")).toHaveText("Схема сохранена в браузере.");
  await page.reload();
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("circuit.json");
  const imported = editor(page).getByLabel("Импорт JSON");
  await imported.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByRole("status")).toHaveText("Не удалось прочитать или сохранить схему.");
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Очистить поле" }).click();
  await expect(component(page)).toHaveCount(0);
  await imported.setInputFiles((await file.path())!);
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
});

test("exports a line diagram that the existing laboratory calculates", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример длинной линии" }).click();
  await expect(board(page).locator('[data-component-id="TL1"]')).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const file = await pending;
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const revision = await lab.getAttribute("data-model-revision");
  await page.getByRole("button", { name: "Ещё инструменты и справка" }).click();
  await lab.locator('input[type="file"]').setInputFiles((await file.path())!);
  await expect(lab).not.toHaveAttribute("data-model-revision", revision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await expect(lab).toHaveAttribute("data-method", "exact-fronts");
  await expect(lab.locator("[data-line-section]")).toHaveCount(1);
});

test("keeps a fixed resistor in place during whole-diagram optimization", async ({ page }, info) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример RLC" }).click();
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("R1");
  const resistor = board(page).locator('[data-component-id="R1"]');
  const initial = await resistor.getAttribute("transform");
  await page.getByRole("button", { name: "Зафиксировать положение" }).click();
  await page.getByRole("button", { name: "Оптимизировать схему", exact: true }).click();
  await expect(resistor).toHaveAttribute("transform", initial!);
  await expect(board(page).locator("polyline")).toHaveCount(4);
  await editor(page).screenshot({ path: info.outputPath("circuit-layout-desktop.png") });
});

test.describe("small touch viewport", () => {
  test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true });
  test("places a transmission section with two taps and keeps controls within the viewport", async ({ page }, info) => {
    await page.goto(route);
    await expect(editor(page)).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Длинная линия", exact: true }).tap();
    await board(page).tap({ position: { x: 70, y: 90 } });
    await board(page).tap({ position: { x: 240, y: 90 } });
    await expect(board(page).locator('[data-component-id="TL1"]')).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Длина, m" })).toHaveValue("500000");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await editor(page).screenshot({ path: info.outputPath("circuit-line-mobile.png") });
  });
});

test("undo and redo include settings and an imported document", async ({ page }) => {
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  const grid = page.getByLabel("Показать сетку");
  await grid.check();
  await page.getByRole("button", { name: "Отменить", exact: true }).click({ timeout: 2000 });
  await expect(grid).not.toBeChecked();
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(grid).toBeChecked();
  const payload = { schemaVersion: 1, topology: { components: [], junctions: [], wires: [] },
    geometry: { positions: {}, junctionPositions: {} }, metadata: { title: "Imported" },
    settings: { grid: 20, showGrid: false, zigzag: true } };
  await editor(page).getByLabel("Импорт JSON").setInputFiles({
    name: "settings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(grid).not.toBeChecked();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(grid).toBeChecked();
  await expect(page.getByLabel("Шаг сетки")).toHaveValue("10");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByLabel("Шаг сетки")).toHaveValue("20");
});

test("uses the integrated editor, shows live readings, and restores its calculated diagram", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const revision = await lab.getAttribute("data-model-revision");
  const panel = page.getByText("Универсальный редактор схем", { exact: true });
  await panel.click();
  await editor(page).getByRole("button", { name: "Пример длинной линии" }).click();
  await editor(page).getByRole("button", { name: "Рассчитать эту схему" }).click();
  await expect(lab).not.toHaveAttribute("data-model-revision", revision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const line = editor(page).locator('[data-circuit-reading="TL1"]');
  await expect(line).toContainText(/0\s+В/);
  const cursor = lab.getByRole("slider", { name: "Курсор времени", includeHidden: true });
  await cursor.evaluate((slider: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0.01");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(line).toContainText("12");
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("TL1");
  const length = editor(page).getByRole("spinbutton", { name: "Длина, m" });
  await length.fill("600000");
  await length.press("Enter");
  await expect(line).toHaveCount(0);
  await page.reload();
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await panel.click();
  await expect(line).toBeVisible();
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("TL1");
  await expect(length).toHaveValue("500000");
});

test.describe("mobile zoom gesture", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("pinches the canvas without placing an armed component", async ({ page }) => {
    await page.goto(route);
    await expect(editor(page)).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Резистор", exact: true }).tap();
    await board(page).scrollIntoViewIfNeeded();
    const box = (await board(page).boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const session = await page.context().newCDPSession(page);
    const point = (id: number, dx: number) => ({ id, x: center.x + dx, y: center.y });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1, -30), point(2, 30)] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(1, -55), point(2, 55)] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(board(page)).not.toHaveAttribute("data-zoom", "1");
    await expect(component(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Отменить", exact: true })).toBeDisabled();
  });
});

test("browser layout keeps the netlist and completes on a narrow viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "Пример RLC" }).click();
  const viewport = editor(page).locator("[data-circuit-nets]");
  const nets = await viewport.getAttribute("data-circuit-nets");
  const optimize = page.getByRole("button", { name: "Оптимизировать схему", exact: true });
  const elapsedMs = await optimize.evaluate(button => {
    const now = performance.now();
    (button as HTMLButtonElement).click();
    return performance.now() - now;
  });
  await info.attach("browser-layout-ms", { body: String(elapsedMs), contentType: "text/plain" });
  expect(elapsedMs).toBeLessThan(500);
  await expect(viewport).toHaveAttribute("data-circuit-nets", nets!);
  await expect(board(page).locator("[data-circuit-wire]")).toHaveCount(4);
});
