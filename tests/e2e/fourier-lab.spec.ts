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
    await lab.locator("select").nth(1).selectOption("dct");
    await expect(lab.locator(".fourier-note")).toBeVisible();
    const reconstructedPoints = await lab.locator(".fourier-reconstructed").getAttribute("points");
    expect(new Set((reconstructedPoints ?? "").split(/\s+/).map((point) => point.split(",")[1])).size).toBeGreaterThan(1);
    await lab.getByRole("button", { name: /Сброс фазы|Скинути фазу/ }).click();
    await expect(lab.locator('[data-fourier-phase]')).toHaveValue("0");
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

test("Harmonic Playground applies signal edits immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ru/interactive/fourier/");
  const lab = page.locator("[data-fourier-lab]");
  await lab.locator("summary", { hasText: "Harmonic Playground" }).click();
  await lab.getByRole("button", { name: "Сигнал" }).click();
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
  await expect(field).toHaveValue("-1.25");
});

test("disabling a selected harmonic removes its vector without substituting a hidden one", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/ru/interactive/fourier/");
 const lab=page.locator("[data-fourier-lab]");await expect(lab.locator(".fourier-vector")).toHaveCount(16);
 await lab.locator(".fourier-table input[type=checkbox]").first().uncheck();await expect(lab.locator(".fourier-vector")).toHaveCount(15);
 await lab.locator(".fourier-table input[type=checkbox]").first().check();await expect(lab.locator(".fourier-vector")).toHaveCount(16);
});

test("playground configuration restores the actual signal after leaving its mode", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/ru/interactive/fourier/");const lab=page.locator("[data-fourier-lab]");
 await lab.locator("summary",{hasText:"Harmonic Playground"}).click();await lab.getByRole("button",{name:"Сигнал",exact:true}).click();
 await lab.locator(".playground-controls select").selectOption("triangle");const curve=await lab.locator(".fourier-original").getAttribute("points");
 await lab.getByRole("button",{name:"Сохранить",exact:true}).click();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("electrotutor-fourier-config")!));expect(validateFourierConfig(saved),JSON.stringify({...saved,points:saved?.points?.length})).toBe(true);await lab.getByRole("button",{name:"Демо-контур",exact:true}).click();await expect(lab.locator("[data-fourier-playground]")).toHaveCount(0);
 await lab.getByRole("button",{name:"Загрузить",exact:true}).click();await expect(lab.locator("[data-fourier-playground]")).toBeVisible();await expect(lab.locator(".fourier-original")).toHaveAttribute("points",curve!);
});
