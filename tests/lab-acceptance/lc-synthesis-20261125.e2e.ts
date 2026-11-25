import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const baseline = JSON.parse(await readFile(new URL("../fixtures/electrotutor-20261125-baseline.json", import.meta.url), "utf8"));

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/reactive-two-port-graph/experiment/`;
const editorSelector = "[data-line-experiment-editor]:not([inert])";

async function importFixture(page: Page, archive: unknown) {
  await expect(page.locator("[data-lc-experiment]")).toHaveAttribute("data-ready", "true");
  await page.locator("[data-lc-import]").setInputFiles({
    name: "synthetic-lc.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(archive)),
  });
}

test("EVAL-05 previews a real exact local step before applying and undoing it", async ({ page }) => {
  await page.goto(route("ru"));
  await importFixture(page, { schema: "electrotutor-reactive-two-port-v1", circuit: {
    kind: "series", left: { kind: "l", value: 10 }, right: { kind: "l", value: 16 },
  } });
  const editor = page.locator(editorSelector);
  await expect(page.locator('[data-lc-transformations] > summary')).toBeVisible();
  await page.locator('[data-lc-transformations] > summary').click();
  const step = page.locator("[data-lc-transform-step]").first();
  await expect(step).toBeVisible();
  await expect(step.locator('[data-lc-proof="exact-rational"]')).toBeVisible();
  await expect(step.locator("[data-lc-numeric-substitution]")).toContainText("(26) ≈ (10) + (16)");
  const apply = page.locator("[data-lc-apply-local]");
  await expect(apply).toBeEnabled();
  const original = await page.locator("[data-lc-formula]").first().textContent();
  await apply.click();
  await editor.locator("[data-line-wire-mode]").click();
  await expect(editor.locator('[data-line-kind="l"]')).toHaveCount(1);
  await expect(page.locator("[data-lc-formula]").first()).toHaveText(original!);
  await page.locator("[data-lc-undo]").click();
  await expect(editor.locator('[data-line-kind="l"]')).toHaveCount(2);
});

test("EVAL-05 seven elements have three poles, two zeros and four compact six-element forms", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route("uk"));
  await importFixture(page, baseline.reactiveSynthesis.archive);
  const result = page.locator("[data-lc-experiment-result]");
  await expect(result.locator('[data-lc-resonance="pole"]')).toHaveCount(3);
  await expect(result.locator('[data-lc-resonance="zero"]')).toHaveCount(2);
  for (const key of ["foster-i", "foster-ii", "cauer-i", "cauer-ii"]) {
    const form = result.locator(`[data-${key}]`);
    await form.locator(":scope > summary").click();
    const board = form.locator(".lc-synthesis-schematic");
    await expect(board.locator("[data-lc-symbol]")).toHaveCount(6);
    const dimensions = await board.evaluate(el => ({ client: el.clientWidth, content: el.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.client + 2);
    const formula = form.locator(".lc-synthesis-formula");
    expect(await formula.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await form.screenshot({ path: info.outputPath(`${key}-390.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const old = await result.locator("[data-lc-formula]").first().textContent();
  await result.locator('[data-lc-apply-form="cauer-i"]').click();
  await expect(result.locator("[data-lc-formula]").first()).toHaveText(old!);
  const editor = page.locator(editorSelector);
  await editor.locator("[data-line-wire-mode]").click();
  await expect(editor.locator('[data-line-kind="l"], [data-line-kind="c"]')).toHaveCount(6);
  await editor.locator("[data-line-wire-mode]").click();
  await editor.locator('[data-line-palette="l"]').click();
  await editor.getByRole("button", { name: "Вибрати два вузли" }).click();
  await editor.locator('[data-line-cross-endpoint="P1:a"]').click();
  await editor.locator('[data-line-cross-endpoint="P1:b"]').click();
  await expect(editor.locator('[data-line-kind="l"], [data-line-kind="c"]')).toHaveCount(7);
});
