import { test, expect } from '@playwright/test';

const home = `${process.env.E2E_BASE_PATH || '/'}ru/`;

test('reference home leads to a real editable lesson and retains the chosen theme', async ({ page }) => {
  await page.goto(home);
  await expect(page.locator('.ref-hero h1')).toContainText('Электротехника');
  await page.locator('.ref-ctas a').first().click();
  await expect(page.locator('h1')).toHaveText('Метод контурных токов');
  await page.getByRole('link', { name: 'Следующий этап', exact: true }).click();
  await expect(page).toHaveURL(/examples/);
  await page.getByRole('link', { name: 'Следующий этап', exact: true }).click();
  await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('parameter-value').fill('5');
  await expect(page.getByTestId('parameter-value')).toHaveValue('5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('#mvp-theme').click();
  const after = before === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', after);
  await page.locator('.mvp-brand').click();
  await expect(page.locator('.ref-hero')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', after);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', after);
});

test('reference home keeps every CTA usable without JavaScript at phone width', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto(home);
  expect(await page.locator('.ref-cards a').count()).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('.ref-cards a').nth(2).click();
  await expect(page.locator('.mesh-nojs')).toBeVisible();
  await context.close();
});
