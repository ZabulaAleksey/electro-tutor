import { expect, test, type Page } from "@playwright/test";

const path = "/ru/interactive/transmission-line/";
const canvas = (page: Page) => page.locator("[data-network-canvas]");
const ready = (page: Page) => expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready", "true");
const sections = (page: Page) => page.locator("[data-line-section]");
const position = (page: Page, x: number, y: number) => canvas(page).locator(".network-schematic-drawing").evaluate((element, point) => {
  const matrix = (element as SVGGElement).getScreenCTM()!;
  const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(matrix);
  return { x, y };
}, { x, y });
const middle = async (locator: ReturnType<Page["locator"]>) => {
  const rect = await locator.boundingBox();
  if (!rect) throw Error("Missing control bounds");
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

test("home opens the topic catalogue, and pointer drag commits only at the highlighted end", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/ru/");
  await page.getByRole("link", { name: "Выбрать лабораторию", exact: true }).click();
  await expect(page.getByRole("link", { name: "Теория и формулы" })).toHaveAttribute("href", "/ru/topics/");
  await page.getByRole("link", { name: "Переходные процессы в линии", exact: true }).click();
  await ready(page);

  const from = await middle(page.locator('[data-network-tool="line"]'));
  const target = await position(page, 290, 84);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await expect(canvas(page).locator('[data-placement="end"]')).toHaveAttribute("data-snapped", "true");
  await expect(sections(page)).toHaveCount(1);
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(2);
  await ready(page);

  await page.getByRole("button", { name: "Отменить изменение" }).click();
  await expect(sections(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Повторить изменение" }).click();
  await expect(sections(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Ещё инструменты и справка" }).click();
  await expect(page.getByText("Как распространяются волны")).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(sections(page)).toHaveCount(2);
  expect(failures).toEqual([]);
});

test("invalid and canceled drops preserve the existing circuit", async ({ page }) => {
  await page.goto(path);
  await ready(page);
  const from = await middle(page.locator('[data-network-tool="line"]'));
  const invalid = await position(page, 143, 84);
  const valid = await position(page, 290, 84);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(invalid.x, invalid.y, { steps: 8 });
  await expect(canvas(page).locator('[data-snapped=true]')).toHaveAttribute("data-allowed", "false");
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(1);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(valid.x, valid.y, { steps: 8 });
  await expect(canvas(page).locator('[data-snapped=true]')).toHaveAttribute("data-allowed", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(1);
  await expect(canvas(page).locator("[data-placement]")).toHaveCount(0);
});

test("keyboard places a line and the inspector removes it", async ({ page }) => {
  await page.goto(path);
  await ready(page);
  const add = page.getByRole("button", { name: "Добавить линию", exact: true });
  await add.press("Enter");
  const target = canvas(page).getByRole("button", { name: "Конец линии" });
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sections(page)).toHaveCount(2);
  await canvas(page).getByRole("button", { name: "TL2 · линия" }).press("Enter");
  await page.locator(".network-tray").getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(sections(page)).toHaveCount(1);
  await ready(page);
});

test.describe("touch workspace", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("drag, tap, edit, move and remove with touch input", async ({ page, context }) => {
    await page.goto(path);
    await ready(page);
    const session = await context.newCDPSession(page);
    const dispatch = (type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id?: number }>) =>
      session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const toolbar = page.getByRole("group", { name: "Управление конструктором" });
    await toolbar.getByRole("button", { name: "Элементы" }).tap();
    const start = await middle(page.locator('[data-network-tool="shunt"]'));
    const target = await position(page, 143, 84);
    await dispatch("touchStart", [start]);
    await dispatch("touchMove", [{ x: start.x, y: start.y - 26 }]);
    await dispatch("touchMove", [target]);
    await expect(canvas(page).locator('[data-placement="span"][data-snapped=true]')).toHaveAttribute("data-allowed", "true");
    const ghost = await page.locator(".network-drag-ghost").boundingBox();
    expect(ghost!.y + ghost!.height / 2).toBeLessThan(target.y - 20);
    await dispatch("touchEnd", []);
    await expect(sections(page)).toHaveCount(2);
    await ready(page);

    await canvas(page).getByRole("button", { name: "Шунтирующий резистор · 1" }).tap();
    const resistance = page.locator(".network-tray").getByRole("spinbutton", { name: "Сопротивление R, Ω" });
    await resistance.fill("125");
    await expect(toolbar).toBeVisible();
    await page.locator(".network-tray").getByRole("button", { name: "Переместить" }).tap();
    await canvas(page).getByRole("button", { name: "Узел соединения · 0" }).tap();
    await canvas(page).getByRole("button", { name: "Шунтирующий резистор · 0" }).tap();
    await expect(resistance).toHaveValue("125");
    await page.locator(".network-tray").getByRole("button", { name: "Удалить" }).tap();
    await expect(canvas(page).getByRole("button", { name: "Шунтирующий резистор · 0" })).toHaveCount(0);

    await toolbar.getByRole("button", { name: "Элементы" }).tap();
    await page.locator('[data-network-tool="matched"]').tap();
    await canvas(page).getByRole("button", { name: "Конец линии" }).tap();
    await ready(page);
    const original = await canvas(page).locator(".network-schematic-drawing").getAttribute("transform");
    const origin = await middle(canvas(page));
    await dispatch("touchStart", [{ x: origin.x - 30, y: origin.y, id: 1 }, { x: origin.x + 30, y: origin.y, id: 2 }]);
    await dispatch("touchMove", [{ x: origin.x - 75, y: origin.y, id: 1 }, { x: origin.x + 75, y: origin.y, id: 2 }]);
    await dispatch("touchEnd", []);
    await expect(canvas(page).locator(".network-schematic-drawing")).not.toHaveAttribute("transform", original!);
    await page.getByRole("button", { name: "Показать всю схему" }).tap();
    await expect(canvas(page).locator(".network-schematic-drawing")).toHaveAttribute("transform", original!);
    await expect(sections(page)).toHaveCount(2);
  });

  for (const [width, height] of [[320, 650], [430, 932], [768, 1024], [844, 390], [1280, 800]]) {
    test(`toolbar fits and stays available at ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await ready(page);
      const toolbar = page.getByRole("group", { name: "Управление конструктором" });
      await page.locator("#network-results").scrollIntoViewIfNeeded();
      await expect(toolbar).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const buttons = await toolbar.getByRole("button").evaluateAll(elements => elements.map(el => {
        const rect = el.getBoundingClientRect();
        return Math.min(rect.width, rect.height);
      }));
      expect(Math.min(...buttons)).toBeGreaterThanOrEqual(44);
    });
  }
});
