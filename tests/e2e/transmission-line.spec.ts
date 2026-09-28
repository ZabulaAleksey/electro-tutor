import { expect, test } from "@playwright/test";

test("interactive cards expose separate circular and line laboratories in both languages", async ({ page }) => {
  await page.goto("/ru/interactive/");
  await page.getByRole("link", { name: /Открыть круговую диаграмму/ }).click();
  await expect(page).toHaveURL(/\/ru\/interactive\/circular-diagram\//);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Годограф");
  await expect(page.locator(".circle-controls")).toBeVisible();
  await page.goto("/uk/interactive/");
  await page.getByRole("link", { name: /Відкрити симулятор довгої лінії/ }).click();
  await expect(page).toHaveURL(/\/uk\/interactive\/transmission-line\//);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("довгій лінії");
});

test("separate circular page preserves its share state across reload and language change", async ({ page }) => {
  await page.goto("/ru/interactive/circular-diagram/?i0m=2.75&r=50#diagram");
  await expect(page.locator(".circle-controls fieldset").first().getByRole("spinbutton").first()).toHaveValue("2.75");
  await page.reload();
  await expect(page.locator(".circle-controls fieldset").first().getByRole("spinbutton").first()).toHaveValue("2.75");
  await page.locator("a[data-language-link]").click();
  await expect(page).toHaveURL(/\/uk\/interactive\/circular-diagram\//);
  expect(new URL(page.url()).searchParams.get("i0m")).toBe("2.75");
  expect(new URL(page.url()).hash).toBe("#diagram");
});

test("real WASM worker advances open line, draws both epures and seeks deterministically", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/ru/interactive/transmission-line/");
  await expect(page.getByText("Модель готова")).toBeVisible();
  const canvases = page.locator(".line-plots canvas");
  await expect(canvases).toHaveCount(2);
  await page.getByRole("button", { name: "Пуск" }).click();
  const time = page.locator(".line-diagnostics dd").first();
  await expect.poll(async () => parseFloat(await time.textContent() || "0"), { timeout: 15000 }).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Пауза" }).click();
  await expect.poll(async () => parseFloat(await page.locator(".line-diagnostics dd").nth(3).textContent() || "0"))
    .toBeGreaterThan(80);
  const data = await canvases.first().evaluate(canvas => {
    const c = canvas as HTMLCanvasElement;
    const pixels = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, changed: pixels ? Array.from(pixels).some(value => value !== 0) : false };
  });
  expect(data.width).toBeGreaterThan(0);
  expect(data.changed).toBe(true);
  await page.getByRole("spinbutton", { name: "Перейти к времени, мс" }).fill("3");
  await page.getByRole("button", { name: "Перейти к времени, мс" }).click();
  await expect.poll(async () => parseFloat(await time.textContent() || "0")).toBeCloseTo(3, 1);
  await page.getByRole("button", { name: "Сброс" }).click();
  await expect(time).toContainText("0 мс");
  expect(failures).toEqual([]);
});

test("load and grid settings reconfigure the worker without stale simulation state", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  await expect(page.getByText("Модель готова")).toBeVisible();
  await page.getByRole("button", { name: "Согласованная" }).click();
  await page.getByRole("spinbutton", { name: "Число ячеек" }).fill("5000");
  await page.getByRole("button", { name: "Применить параметры" }).click();
  await expect(page.getByText("Модель готова")).toBeVisible();
  await page.getByRole("button", { name: "Один шаг" }).click();
  await expect(page.locator(".line-diagnostics dd").nth(1)).toHaveText("1");
  await expect(page.locator(".line-derived")).toContainText("200 м");
});

test("capacitor and inductor loads evolve persistent device state after wave arrival", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  await expect(page.getByText("Модель готова")).toBeVisible();
  for (const [preset, quantity] of [["Ёмкость", "U_C"], ["Индуктивность", "I_L"]] as const) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await page.getByRole("button", { name: "Применить параметры" }).click();
    await expect(page.getByText("Модель готова")).toBeVisible();
    await page.getByRole("spinbutton", { name: "Перейти к времени, мс" }).fill("6");
    await page.getByRole("button", { name: "Перейти к времени, мс" }).click();
    await expect.poll(async () => {
      const text = await page.locator(".line-diagnostics p").last().textContent() || "";
      const match = text.match(new RegExp(`${quantity}=(-?[\\d.]+)`));
      return match ? Math.abs(Number(match[1])) : 0;
    }).toBeGreaterThan(0.001);
  }
});
