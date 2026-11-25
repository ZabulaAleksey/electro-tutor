import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const route = (language: "ru" | "uk") => `${prefix}/${language}/interactive/three-phase-sequences/`;
const labSelector = '[data-seq-lab][data-ready="true"]';

async function addSeries(lab: Locator, area: string, at: number, resistance: number) {
  await lab.locator("[data-seq-area]").selectOption(area);
  await lab.locator('[data-seq-kind]').selectOption("series");
  await lab.locator('[data-seq-at]').fill(String(at));
  await lab.locator('[data-seq-edit-r]').fill(String(resistance));
  await lab.locator('[data-seq-add]').click();
}

test("EVAL-06 models and archives edits in all three areas with a selectable measured section", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${prefix}/ru/interactive/`);
  const link = page.locator(`a[href="${route("ru")}"]`);
  await expect(link).toBeVisible();
  await link.click();
  const lab = page.locator(labSelector);
  await expect(lab.locator("[data-seq-schematic]")).toBeVisible();
  await expect(lab.locator("[data-seq-network]")).toHaveCount(3);
  await expect(lab.locator("[data-seq-phasors]")).toHaveCount(2);
  const initial = Number(await lab.locator('[data-seq-reading="I2"]').getAttribute("data-magnitude"));
  expect(initial).toBeLessThan(1e-8);
  await addSeries(lab, "generator", .75, 2);
  await addSeries(lab, "line", .4, 3);
  await addSeries(lab, "load", .25, 4);
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(3);
  await expect(lab.locator("[data-seq-coupling]")).toHaveCount(3);
  const picker = lab.locator("[data-seq-section-select]");
  const sections = await picker.locator("option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value));
  expect(sections.length).toBeGreaterThan(3);
  await picker.selectOption(sections.at(-1)!);
  await expect(lab.locator("[data-seq-selected-section]")).toHaveAttribute("data-seq-selected-section", sections.at(-1)!);
  expect(Number(await lab.locator('[data-seq-reading="I2"]').getAttribute("data-magnitude"))).toBeGreaterThan(.01);
  await lab.screenshot({ path: info.outputPath("multiple-sites-ru.png"), animations: "disabled" });
  const download = page.waitForEvent("download");
  await lab.locator("[data-seq-download]").click();
  const saved = info.outputPath("sequence-experiment.json");
  await (await download).saveAs(saved);
  const archive = JSON.parse(await readFile(saved, "utf8"));
  expect(archive.edits.map((edit: { area: string }) => edit.area)).toEqual(["generator", "line", "load"]);
  await lab.locator("[data-seq-remove-edit]").first().click();
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(2);
  await lab.locator("[data-seq-import]").setInputFiles(saved);
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(3);
  await lab.locator("[data-seq-import]").setInputFiles({ name: "invalid.json", mimeType: "application/json",
    buffer: Buffer.from('{"schema":"invalid"}') });
  await expect(lab.getByRole("alert")).toBeVisible();
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(3);
  for (const count of [2, 1, 0]) {
    await lab.locator("[data-seq-remove-edit]").last().click();
    await expect(lab.locator("[data-seq-edit]")).toHaveCount(count);
  }
  await lab.locator('[data-seq-pick-area="generator"]').click();
  await expect(lab.locator('[data-seq-area]')).toHaveValue("generator");
  expect(errors).toEqual([]);
});

test("EVAL-06 ideal fault and isolated neutral have explicit mobile results and the old star is separate", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route("uk"));
  const lab = page.locator(labSelector);
  await expect(lab.locator("[data-seq-network]")).toHaveCount(3);
  await lab.locator("[data-seq-area]").selectOption("line");
  await lab.locator("[data-seq-kind]").selectOption("shunt");
  await lab.locator("[data-seq-at]").fill("0.65");
  await lab.locator("[data-seq-target]").selectOption("ground");
  await lab.locator("[data-seq-add]").click();
  await expect(lab.locator("[data-seq-edit]")).toHaveCount(1);
  expect(Number(await lab.locator('[data-seq-reading="I0"]').getAttribute("data-magnitude"))).toBeGreaterThan(0);
  await lab.locator("[data-seq-remove-edit]").click();
  await lab.locator('select[data-seq-neutral="generator"]').selectOption("isolated");
  await lab.locator('select[data-seq-neutral="load"]').selectOption("isolated");
  await expect(lab.locator('[data-seq-network="0"]')).toHaveAttribute("data-open", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await lab.screenshot({ path: info.outputPath("isolated-neutral-uk.png"), animations: "disabled" });
  await page.goto(`${prefix}/uk/interactive/star-neutral/`);
  await expect(page.getByRole("heading", { name: /Несиметрична зірка/i }).first()).toBeVisible();
});

test("EVAL-06 isolates a phase between two breaks without reporting a false common voltage reference", async ({ page }) => {
  await page.goto(route("ru"));
  const lab = page.locator(labSelector);
  await lab.locator("[data-seq-area]").selectOption("line");
  await lab.locator("[data-seq-kind]").selectOption("open");
  for (const at of ["0.25", "0.75"]) {
    await lab.locator("[data-seq-at]").fill(at);
    await lab.locator("[data-seq-add]").click();
  }
  const picker = lab.locator("[data-seq-section-select]");
  const betweenBreaks = await picker.locator("option").filter({ hasText: /0[,.]25.*0[,.]75/ }).getAttribute("value");
  expect(betweenBreaks).not.toBeNull();
  await picker.selectOption(betweenBreaks!);
  await expect(lab.locator('[data-seq-reference="mixed-reference"]')).toBeVisible();
  await expect(lab.locator('[data-seq-phasors="voltage"]')).toHaveCount(0);
  await expect(lab.locator('[data-seq-phasors="current"]')).toHaveCount(1);
  await expect(lab.locator('[data-seq-reading="IA"]')).toHaveAttribute("data-magnitude", "0");
  expect(Number(await lab.locator('[data-seq-reading="UB"]').getAttribute("data-magnitude"))).toBeGreaterThan(0);
});
