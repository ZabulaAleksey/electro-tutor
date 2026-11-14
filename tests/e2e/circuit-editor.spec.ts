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
