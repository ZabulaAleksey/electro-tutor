import { readFile } from "node:fs/promises";
import { validateFourierConfig } from "../../src/fourier/config";
import { expect, test } from "@playwright/test";

for (const language of ["ru", "uk"] as const) {
  test(`${language} Fourier contour, harmonic edit, basis and controls are live`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${language}/interactive/fourier/`);
    const lab = page.locator("[data-fourier-lab]");
    await expect(lab).toBeVisible();
    await expect(lab.locator(".engineering-plot")).toBeVisible();
    await expect(lab.locator("[data-fourier-harmonics]")).toHaveValue("16");
    const before = await lab.getAttribute("data-fourier-rms");
    await lab.locator('input[aria-label^="amplitude "]').first().fill("0.25");
    await expect.poll(() => lab.getAttribute("data-fourier-rms")).not.toBe(before);
    await lab.locator('[data-fourier-phase]').fill("0.37");
    const traceEnd = await lab.locator("[data-fourier-trace]").evaluate((node) => node.getAttribute("points")?.trim().split(/\s+/).at(-1));
    const endpoint = await lab.locator(".fourier-endpoint").evaluate((node) => `${node.getAttribute("cx")},${node.getAttribute("cy")}`);
    expect(traceEnd).toBe(endpoint);
    await lab.getByRole("button", { name: /Сброс фазы|Скинути фазу/ }).click();
    await expect(lab.locator('[data-fourier-phase]')).toHaveValue("0");
    await page.goto(`/${language}/interactive/fourier/bases/`);
    await page.locator("[data-basis-selector]").selectOption("dct");
    await expect(page.locator("[data-basis-analysis]")).toHaveAttribute("data-basis", "dct");
    await expect(page.locator("[data-basis-coefficient]").first()).toBeVisible();
    await expect(page.locator("[data-basis-epicycles]")).toHaveCount(0);
    const reconstructedPoints = await page.locator(".engineering-plot [data-plot-curve]").nth(1).getAttribute("points");
    expect(new Set((reconstructedPoints ?? "").split(/\s+/).map(point => point.split(",")[1])).size).toBeGreaterThan(1);
  });
}

test("Fourier drawing and mobile layout stay local and bounded", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ru/interactive/fourier/");
  const lab = page.locator("[data-fourier-lab]");
  const canvas = lab.locator("svg.fourier-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 40, box.y + 50); await page.mouse.down();
  for (let i = 0; i < 8; i += 1) await page.mouse.move(box.x + 40 + i * 18, box.y + 50 + i * 8);
  await page.mouse.up();
  await expect(lab.locator(".fourier-reconstructed")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("signal presets apply signal edits immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ru/interactive/fourier/");
  const lab = page.locator("[data-fourier-lab]");
  await lab.locator("[data-contour-preset]").selectOption("signal-square");
  await expect(lab.locator("[data-fourier-playground]")).toBeVisible();
  const before = await lab.locator("[data-fourier-playground] [data-plot-curve]").first().getAttribute("points");
  await lab.locator(".playground-controls input[type=range]").first().fill("1.6");
  await expect.poll(() => lab.locator("[data-fourier-playground] [data-plot-curve]").first().getAttribute("points")).not.toBe(before);
});


test("negative phase entry preserves a composable numeric draft", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ru/interactive/fourier/");
  const field = page.getByLabel("phase 1", { exact: true });
  await expect(field).toBeEnabled();
  await field.fill("");
  await field.pressSequentially("-1.25");
  await field.press("Tab");
  await expect(field).toHaveValue("-1,25");
});

test("disabling a selected harmonic removes its vector without substituting a hidden one", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/ru/interactive/fourier/");
 const lab=page.locator("[data-fourier-lab]");await expect(lab.locator(".fourier-vector")).toHaveCount(16);
 await lab.locator(".fourier-table input[type=checkbox]").first().uncheck();await expect(lab.locator(".fourier-vector")).toHaveCount(15);
 await lab.locator(".fourier-table input[type=checkbox]").first().check();await expect(lab.locator(".fourier-vector")).toHaveCount(16);
});

test("playground configuration restores the actual signal after leaving its mode", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/ru/interactive/fourier/");const lab=page.locator("[data-fourier-lab]");
 await lab.locator("[data-contour-preset]").selectOption("signal-triangle");const curve=await lab.locator(".fourier-original").getAttribute("points");
 await lab.getByRole("button",{name:"Сохранить",exact:true}).click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("electrotutor-fourier-config")!));expect(validateFourierConfig(saved),JSON.stringify({...saved,points:saved?.points?.length})).toBe(true);await lab.getByRole("button",{name:"Демо-контур",exact:true}).click();await expect(lab.locator("[data-fourier-playground]")).toHaveCount(0);
 await lab.getByRole("button",{name:"Загрузить",exact:true}).click();await expect(lab.locator("[data-fourier-playground]")).toBeVisible();await expect(lab.locator(".fourier-original")).toHaveAttribute("points",curve!);
});

test("Fourier rounds its labels and keeps full precision in the CSV and editable draft", async ({ page }, testInfo) => {
  await page.goto("/ru/interactive/fourier/");
  const lab = page.locator("[data-fourier-lab]");
  await lab.getByLabel("Порядок").selectOption("interleaved");
  const dc = lab.getByLabel("amplitude 0", { exact: true });
  const harmonic = lab.getByLabel("amplitude 1", { exact: true });
  await expect(dc).toHaveValue("0");
  await dc.fill("1,388e-16");
  await dc.press("Tab");
  await expect(dc).toHaveValue("1,388·10⁻¹⁶");
  await harmonic.fill("0,123456789");
  await harmonic.press("Tab");
  await expect(harmonic).toHaveValue("0,123");
  await harmonic.focus();
  await expect(harmonic).toHaveValue("0.123456789");
  const download = page.waitForEvent("download");
  await lab.getByRole("button", { name: "CSV", exact: true }).click();
  const csv = testInfo.outputPath("fourier-contour.csv");
  await (await download).saveAs(csv);
  const rows = (await readFile(csv, "utf8")).trim().split("\n").map(row => row.split(","));
  expect(Number(rows.find(row => row[0] === "0")?.[3])).toBe(1.388e-16);
  expect(Number(rows.find(row => row[0] === "1")?.[3])).toBe(0.123456789);
});

test("a portable Fourier configuration restores the signed coefficient, contour and phase", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion:"reduce" });
  await page.goto("/ru/interactive/fourier/polygon-motion/?method=fourier");
  await page.locator("[data-contour-preset]").selectOption("rectangle");
  await page.locator("[data-fourier-phase]").fill("0.43");
  await page.getByLabel("phase -1", { exact:true }).fill("-0.75");
  const before = await page.locator("[data-fourier-lab]").getAttribute("data-fourier-rms");
  const saving = page.waitForEvent("download");
  await page.locator("[data-fourier-export]").click();
  const path = testInfo.outputPath("roundtrip-fourier.json");
  await (await saving).saveAs(path);
  expect(validateFourierConfig(JSON.parse(await readFile(path,"utf8")))).toBe(true);
  await page.getByRole("button",{name:"Демо-контур",exact:true}).click();
  await page.locator("[data-fourier-import]").setInputFiles(path);
  await expect(page.locator("[data-fourier-phase]")).toHaveValue("0.43");
  await expect(page.getByLabel("phase -1",{exact:true})).toHaveValue("-0,75");
  await expect(page.locator("[data-fourier-lab]")).toHaveAttribute("data-fourier-rms",before!);
  await page.locator("[data-fourier-import]").setInputFiles({ name:"bad.json", mimeType:"application/json", buffer:Buffer.from("{}") });
  await expect(page.locator(".fourier-config-error")).toBeVisible();
  await expect(page.locator("[data-fourier-lab]")).toHaveAttribute("data-fourier-rms",before!);
});
