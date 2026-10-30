import { expect, test } from '@playwright/test';
import { wasmLine } from './helpers/wasm-line';
import { D } from '../../src/transient/types';

test('interactive cards expose separate circular and line laboratories in both languages', async ({ page }) => {
  await page.goto('/ru/interactive/');
  await page.getByRole('link', { name: /Открыть круговую диаграмму/ }).click();
  await expect(page).toHaveURL(/\/ru\/interactive\/circular-diagram\//);
  await page.goto('/uk/interactive/');
  await page.getByRole('link', { name: /Відкрити лінію/ }).click();
  await expect(page).toHaveURL(/\/uk\/interactive\/transmission-line\//);
});

test('dedicated circular page restores query state and survives reload and locale switch', async ({ page }) => {
  await page.goto('/ru/interactive/circular-diagram/?i0m=2.75&r=50#diagram');
  const input=page.locator('.circle-controls fieldset').first().getByRole('spinbutton').first();
  await expect(input).toHaveValue('2.75');await page.reload();await expect(input).toHaveValue('2.75');
  await page.locator('a[data-language-link]').click();await expect(page).toHaveURL(/\/uk\/interactive\/circular-diagram\//);
  expect(new URL(page.url()).searchParams.get('i0m')).toBe('2.75');expect(new URL(page.url()).hash).toBe('#diagram');
});

test('real WASM worker advances open line and seeks deterministically; current UI renders both epures', async ({ page }) => {
  const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto('/ru/interactive/transmission-line/');
  await expect(page.locator('[data-network-lab]')).toHaveAttribute('data-calculation-ready','true');
  await expect(page.locator('.network-plot-grid [data-engineering-plot]')).toHaveCount(4);
  expect(await page.locator('.network-plot-grid [data-plot-curve]').count()).toBeGreaterThanOrEqual(4);
  const [[advanced,seek,reset]]=await wasmLine(page,[{times:[.006,.003],reset:true}]);
  expect(advanced.time*1000).toBeGreaterThan(5);expect(advanced.diagnostics[D.loadVoltage]).toBeGreaterThan(80);
  expect(advanced.voltages.some(v=>v!==0)).toBe(true);expect(advanced.currents.some(v=>v!==0)).toBe(true);
  expect(seek.time*1000).toBeCloseTo(3,1);expect(reset.time).toBe(0);expect(failures).toEqual([]);
});

test('retained WASM load and grid configuration reinitializes numerical state', async ({ page }) => {
  await page.goto('/ru/interactive/transmission-line/');
  const [[sample]]=await wasmLine(page,[{kind:'r',sourceResistance:50,resistance:50,cells:5000,step:1}]);
  expect(sample.step).toBe(1);expect(sample.diagnostics[D.dx]).toBe(200);
  expect(sample.voltages).toHaveLength(5001);expect(sample.currents).toHaveLength(5000);
});

test('capacitor and inductor WASM loads evolve persistent device state after wave arrival', async ({ page }) => {
  await page.goto('/ru/interactive/transmission-line/');
  const [[capacitor],[inductor]]=await wasmLine(page,[{kind:'c',times:[.006]},{kind:'l',times:[.006]}]);
  expect(Math.abs(capacitor.diagnostics[D.capacitorVoltage])).toBeGreaterThan(.001);
  expect(Math.abs(inductor.diagnostics[D.inductorCurrent])).toBeGreaterThan(.001);
});

test('ideal source reflects the returning open-load wave for another round trip', async ({ page }) => {
  await page.goto('/ru/interactive/transmission-line/');
  const [[first,second],[matched]]=await wasmLine(page,[{times:[.006,.016]},{sourceResistance:50,times:[.016]}]);
  expect(first.diagnostics[D.loadVoltage]).toBeGreaterThan(150);expect(second.diagnostics[D.loadVoltage]).toBeLessThan(50);
  expect(second.diagnostics[D.sourceVoltage]).toBe(100);
  expect(matched.diagnostics[D.loadVoltage]).toBeGreaterThan(80);expect(matched.diagnostics[D.loadVoltage]).toBeLessThan(120);
});
