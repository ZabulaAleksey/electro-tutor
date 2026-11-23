import { expect, test } from "@playwright/test";

const route = "/ru/interactive/reactive-two-port-graph/experiment/";
const lc = '[data-lc-experiment][data-ready="true"]';
const legacySeries = { schema: "electrotutor-reactive-two-port-v1", circuit: { kind: "series", left: { kind: "l", value: 20 }, right: { kind: "c", value: 50 } } };

test("the compatible LC route opens the canonical editor and moves analytical resonance", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ru/interactive/reactive-two-port/");
  await expect(page).toHaveURL(route);
  const lab = page.locator(lc);
  const input = page.locator("[data-lc-import]");
  await input.setInputFiles({ name: "series-lc.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(legacySeries)) });
  const result = page.locator("[data-lc-experiment-result]");
  const zero = result.locator('[data-lc-resonance="zero"]');
  await expect(zero).toHaveAttribute("data-omega", "1000");
  await expect(page.getByRole("img", { name: "X(ω)", exact: true })).toBeVisible();
  await expect(result.locator("[data-plot-curve]")).toHaveCount(2);
  await expect(result.locator("[data-lc-formula]")).toContainText("(20q^2 + 20) / (q)");
  await page.locator('[data-line-component="C1"]').click();
  await page.locator("[data-lc-nominal]").fill("200");
  await page.locator("[data-lc-nominal]").press("Enter");
  await expect(zero).toHaveAttribute("data-omega", "500");
  await zero.click();
  await expect(result.locator("[data-lc-cursor]")).toContainText("X = 0 Ω");
  const download = page.waitForEvent("download");
  await lab.locator("[data-lc-export]").click();
  const path = testInfo.outputPath("edited-series.json");
  await (await download).saveAs(path);
  await page.reload();
  await input.setInputFiles(path);
  await expect(zero).toHaveAttribute("data-omega", "500");
  expect(errors).toEqual([]);
  await expect(lab.locator('[data-line-glyph="L1"]')).toBeVisible();
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a mobile user changes topology, opens a reduction, and exchanges a validated document", async ({ page }, testInfo) => {
    await page.goto(route);
    const lab = page.locator(lc);
    const input = page.locator("[data-lc-import]");
    await input.setInputFiles({ name: "inductor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schema: legacySeries.schema, circuit: legacySeries.circuit.left })) });
    const result = page.locator("[data-lc-experiment-result]");
    await lab.locator('[data-line-palette="c"]').tap();
    await lab.locator('[data-line-parallel-part="L1"]').tap();
    await lab.locator('[data-line-parallel-side="right"]').tap();
    await lab.locator('[data-line-component="C1"]').tap();
    await lab.locator("[data-lc-nominal]").fill("50");
    await lab.locator("[data-lc-nominal]").press("Enter");
    const pole = result.locator('[data-lc-resonance="pole"]');
    await expect(pole).toHaveAttribute("data-omega", "1000");
    await pole.tap();
    await expect(result.locator("[data-lc-cursor]")).toContainText("|X| → ∞");
    await result.locator("[data-lc-simplification] > summary").tap();
    await expect(result.locator("[data-lc-simplification]")).toHaveJSProperty("open", true);
    const download = page.waitForEvent("download");
    await lab.locator("[data-lc-export]").tap();
    const exported = await download;
    const exportedPath = testInfo.outputPath("reactive-two-port.json");
    await exported.saveAs(exportedPath);
    await lab.locator('[data-line-component="C1"]').tap();
    await lab.locator("[data-line-remove]").tap();
    await lab.locator("[data-line-confirm-remove]").tap();
    await expect(result.locator('[data-lc-resonance="pole"]')).toHaveCount(0);
    await input.setInputFiles(exportedPath);
    await expect(pole).toHaveAttribute("data-omega", "1000");
    await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"invalid"}') });
    await expect(page.locator('[data-lc-notice="error"]')).toBeVisible();
    await expect(pole).toHaveAttribute("data-omega", "1000");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.goto("/uk/interactive/reactive-two-port/");
    await expect(page).toHaveURL(/\/uk\/interactive\/reactive-two-port-graph\/experiment\/$/);
    await expect(page.getByRole("heading", { name: "LC-двополюсник" })).toBeVisible();
  });
});
