import { expect, test, type Page } from "@playwright/test";

function serialDocument() {
  return JSON.stringify({ schemaVersion: 2, topology: { junctions: [], components: [
    { id: "R1", kind: "r", terminals: ["R1:a", "R1:b"], parameters: { ohm: 100, changeAtS: 0, nextOhm: 100 } },
    { id: "L1", kind: "l", terminals: ["L1:a", "L1:b"], parameters: { henry: .01, initial: 0 } },
    { id: "C1", kind: "c", terminals: ["C1:a", "C1:b"], parameters: { farad: .0001, initial: 0 } },
  ], wires: [{ id: "w1", from: "R1:b", to: "L1:a" }, { id: "w2", from: "L1:b", to: "C1:a" }] },
    geometry: { positions: { R1: { x: 120, y: 150, rotation: 0 }, L1: { x: 280, y: 150, rotation: 0 }, C1: { x: 440, y: 150, rotation: 0 } }, junctionPositions: {}, board: { width: 600, height: 360 } },
    metadata: { title: "Serial RLC" }, settings: { grid: 10, showGrid: false, zigzag: false, snap: true } });
}
const editor = (page: Page) => page.locator("[data-circuit-editor]").first();
const board = (page: Page) => editor(page).locator("[data-circuit-board]").first();
async function open(page: Page, lang = "ru") {
  await page.goto(`/${lang}/interactive/circuit-editor/`);
  await expect(editor(page)).toHaveAttribute("data-ready", "true");
  await editor(page).locator('input[type="file"]').setInputFiles({ name: "serial.json", mimeType: "application/json", buffer: Buffer.from(serialDocument()) });
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
}
async function readNets(page: Page): Promise<string[][]> {
  return JSON.parse((await editor(page).locator("[data-circuit-nets]").first().getAttribute("data-circuit-nets"))!);
}
for (const [label, a, b, members] of [
  ["R", "R1:a", "L1:a", ["R1"]], ["L", "L1:a", "C1:a", ["L1"]],
  ["R-L", "R1:a", "C1:a", ["R1", "L1"]], ["whole R-L-C", "R1:a", "C1:b", ["R1", "L1", "C1"]],
] as const) test(`parallel section ${label} previews, commits atomically and survives JSON reload`, async ({ page }) => {
  await open(page);
  const before = await readNets(page);
  await editor(page).locator('[data-circuit-tool="r"]').click();
  await editor(page).locator("[data-parallel-toggle]").click();
  await editor(page).getByLabel("Начальный узел участка", { exact: true }).selectOption(a);
  await editor(page).getByLabel("Конечный узел участка", { exact: true }).selectOption(b);
  await expect(board(page).locator("[data-parallel-preview]")).toBeVisible();
  await expect(board(page).locator("[data-component-id][data-parallel-region]")).toHaveCount(members.length);
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
  expect(await readNets(page)).toEqual(before);
  await editor(page).locator("[data-parallel-apply]").click();
  await expect(board(page).locator("[data-component-id]")).toHaveCount(4);
  const after = await readNets(page);
  expect(after.find(net => net.includes(a))).toContain("R2:a");
  expect(after.find(net => net.includes(b))).toContain("R2:b");
  for (const net of before) expect(after.some(candidate => net.every(id => candidate.includes(id)))).toBe(true);
  await editor(page).getByRole("button", { name: "Отменить", exact: true }).click();
  expect(await readNets(page)).toEqual(before);
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
  await editor(page).getByRole("button", { name: "Повторить", exact: true }).click();
  expect(await readNets(page)).toEqual(after);
  const downloadPromise = page.waitForEvent("download");
  await editor(page).getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  const file = await downloadPromise;
  const filePath = await file.path();
  expect(filePath).toBeTruthy();
  await editor(page).locator('input[type="file"]').setInputFiles(filePath!);
  expect(await readNets(page)).toEqual(after);
});

test("palette drag offers component region, cancel preserves source, ambiguity requires a choice", async ({ page }) => {
  await open(page);
  const before = await readNets(page);
  await editor(page).locator('[data-circuit-tool="r"]').dragTo(board(page).locator('[data-component-id="R1"]'));
  await expect(editor(page).locator("[data-parallel-controls]")).toBeVisible();
  await expect(board(page).locator("[data-parallel-preview]")).toBeVisible();
  await expect(board(page).locator('[data-component-id="R1"]')).toHaveAttribute("data-parallel-region", "true");
  await editor(page).getByRole("button", { name: "Отменить подключение", exact: true }).click();
  expect(await readNets(page)).toEqual(before);
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
  await editor(page).locator("[data-parallel-toggle]").click();
  await editor(page).getByLabel("Начальный узел участка", { exact: true }).selectOption("R1:a");
  await editor(page).getByLabel("Конечный узел участка", { exact: true }).selectOption("C1:b");
  await editor(page).locator("[data-parallel-apply]").click();
  await editor(page).locator('[data-circuit-tool="c"]').click();
  await editor(page).locator("[data-parallel-toggle]").click();
  await editor(page).getByLabel("Начальный узел участка", { exact: true }).selectOption("R1:a");
  await editor(page).getByLabel("Конечный узел участка", { exact: true }).selectOption("C1:b");
  await expect(editor(page).getByRole("group", { name: "Выберите участок", exact: true })).toBeVisible();
  await expect(editor(page).locator("[data-parallel-apply]")).toBeDisabled();
  await editor(page).getByRole("radio").last().check();
  await expect(editor(page).locator("[data-parallel-apply]")).toBeEnabled();
});

test.describe("UK touch and keyboard use the same region selection", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("selects boundaries, previews and cancels without overflow", async ({ page }) => {
    await open(page, "uk");
    await editor(page).locator('[data-circuit-tool="r"]').tap();
    await editor(page).locator("[data-parallel-toggle]").tap();
    await board(page).locator('[data-circuit-terminal="R1:a"]').tap();
    await board(page).locator('[data-circuit-terminal="C1:b"]').tap();
    await expect(board(page).locator("[data-parallel-preview]")).toBeVisible();
    await editor(page).getByRole("button", { name: "Скасувати підключення", exact: true }).tap();
    await editor(page).locator("[data-parallel-toggle]").tap();
    await board(page).locator('[data-component-id="L1"]').focus();
    await page.keyboard.press("Enter");
    await expect(board(page).locator('[data-component-id="L1"]')).toHaveAttribute("data-parallel-region", "true");
    await editor(page).locator("[data-parallel-apply]").tap();
    await expect(board(page).locator("[data-component-id]")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test("equivalent model is explicit, reversible and preserves original editable components", async ({ page }) => {
  await open(page);
  const document = JSON.parse(serialDocument());
  document.topology.components[0].kind = "l";
  document.topology.components[0].parameters = { henry: .02, initial: 2 };
  document.topology.components[1].parameters = { henry: .01, initial: 3 };
  await editor(page).locator('input[type="file"]').setInputFiles({ name: "inductors.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const before = await readNets(page);
  const math = editor(page).locator("[data-equivalent-circuit]").first();
  await math.locator("summary").click();
  await expect(math.locator("[data-equivalent-diagnostic]")).toContainText("несовместимо");
  await expect(page.locator('[data-circuit-editor][data-inspect-only]')).toHaveCount(0);
  await math.getByLabel("Модель расчёта", { exact: true }).selectOption("steady");
  await expect(page.locator('[data-circuit-editor][data-inspect-only]')).toHaveCount(1);
  await expect(math.locator("[data-equivalent-provenance]")).toContainText("R1");
  await expect(math.locator("[data-equivalent-provenance]")).toContainText("L1");
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
  expect(await readNets(page)).toEqual(before);
  await math.getByLabel("Есть взаимная связь", { exact: true }).check();
  await expect(math.locator("[data-equivalent-diagnostic]")).toContainText("Взаимная связь");
  await expect(page.locator('[data-circuit-editor][data-inspect-only]')).toHaveCount(0);
  await math.locator("summary").click();
  await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("R1");
  const nominal = editor(page).getByLabel("Индуктивность, H", { exact: true });
  await nominal.fill("0.04");
  await nominal.blur();
  await expect(nominal).toHaveValue("0.04");
  expect(await readNets(page)).toEqual(before);
  await expect(board(page).locator("[data-component-id]")).toHaveCount(3);
});
