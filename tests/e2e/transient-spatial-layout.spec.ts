import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const route = "/ru/interactive/transmission-line/";

test("aligns spatial plots beside the circuit with the sum under both waves in SVG", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(route);
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const voltage = lab.getByRole("img", { name: "U(x)", exact: true });
  const current = lab.getByRole("img", { name: "I(x)", exact: true });
  const schematic = lab.locator(".circuit-viewport");
  const vb = (await voltage.boundingBox())!;
  const ib = (await current.boundingBox())!;
  const wb = (await schematic.boundingBox())!;
  expect(vb.x).toBeGreaterThan(wb.x + wb.width - 1);
  expect(vb.y).toBeLessThan(wb.y + 150);
  expect(vb.y + vb.height).toBeLessThan(ib.y);
  expect(vb.width).toBeCloseTo(ib.width, 1);
  const axis = (plot: typeof voltage) => plot.evaluate(svg => ({
    domain: svg.parentElement?.dataset.xDomain,
    unit: svg.parentElement?.dataset.xUnit,
    ticks: [...svg.querySelectorAll('.engineering-ticks text[text-anchor="middle"]')]
      .map(tick => [tick.getAttribute("x"), tick.textContent]),
  }));
  expect(await axis(voltage)).toEqual(await axis(current));
  await voltage.press("End");
  await expect(voltage.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", "1000000");
  await expect(current.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", "1000000");
  const style = (plot: typeof voltage) => plot.locator("[data-plot-curve]").evaluateAll(curves => curves.map(curve => ({
    color: curve.getAttribute("stroke"),
    rendered: getComputedStyle(curve).stroke.match(/[0-9.]+/g)?.map(Number) ?? [],
    width: Number.parseFloat(getComputedStyle(curve).strokeWidth),
  })));
  for (const plot of [voltage, current]) {
    const curves = await style(plot);
    expect(curves.map(curve => curve.color)).toEqual(["var(--blue)", "var(--red)", "var(--green)"]);
    expect(curves[0].width).toBeGreaterThan(curves[1].width);
    expect(curves[0].width).toBeGreaterThan(curves[2].width);
    const dominant = curves.map(({ rendered }) => rendered.indexOf(Math.max(...rendered)));
    expect(dominant).toEqual([2, 0, 1]);
  }

  await lab.getByText("Экспорт результатов", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await lab.getByRole("button", { name: "SVG · U(x)", exact: true }).click();
  const path = testInfo.outputPath("voltage.svg");
  await (await pending).saveAs(path);
  const markup = await readFile(path, "utf8");
  expect(markup.indexOf('data-plot-curve="U(x)"')).toBeGreaterThan(0);
  expect(markup.indexOf("Прямая U⁺")).toBeGreaterThan(markup.indexOf('data-plot-curve="U(x)"'));
  expect(markup.indexOf("Обратная U⁻")).toBeGreaterThan(markup.indexOf("Прямая U⁺"));
  const widths = [...markup.matchAll(/<polyline[^>]*data-plot-curve="[^"]+"[^>]*stroke-width="([0-9.]+)(?:px)?"/g)]
    .map(match => Number(match[1]));
  expect(widths).toHaveLength(3);
  expect(widths[0]).toBeGreaterThan(Math.max(widths[1], widths[2]));
});

test("keeps the compact circuit and both spatial plots usable at 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const canvas = lab.locator("[data-network-canvas]");
  const voltage = lab.getByRole("img", { name: "U(x)", exact: true });
  const current = lab.getByRole("img", { name: "I(x)", exact: true });
  const workbench = lab.getByRole("region", { name: "Конструктор линий" });
  const viewport = canvas.locator("..");
  const v = (await voltage.boundingBox())!;
  const i = (await current.boundingBox())!;
  const w = (await workbench.boundingBox())!;
  expect(i.y + i.height - w.y).toBeLessThan(785);
  expect((await viewport.boundingBox())!.height).toBeGreaterThan(215);
  expect(v.y + v.height).toBeLessThan(i.y);
  expect(i.x + i.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const focusedLayout = await page.evaluate(() => {
    const board = document.querySelector(".circuit-viewport")!;
    const current = document.querySelector('svg[aria-label="I(x)"]')!;
    const dock = document.querySelector(".network-dock")!;
    window.scrollBy({ top: board.getBoundingClientRect().top - 90, behavior: "instant" });
    return { top: board.getBoundingClientRect().top, bottom: current.getBoundingClientRect().bottom, dock: dock.getBoundingClientRect().top };
  });
  expect(focusedLayout.top).toBeGreaterThanOrEqual(75);
  expect(focusedLayout.bottom).toBeLessThanOrEqual(focusedLayout.dock);
  await current.press("Home");
  await expect(voltage.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x", "0");
  await expect(lab.getByRole("img", { name: "U(t)", exact: true })).toBeVisible();
  await expect(lab.getByRole("img", { name: "I(t)", exact: true })).toBeVisible();
});
