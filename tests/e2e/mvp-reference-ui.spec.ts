import { test, expect } from '@playwright/test';

const home = `${process.env.E2E_BASE_PATH || '/'}ru/`;

test('home leads to a real editable lesson and stays light under a dark OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('potential-theme', 'dark'));
  await page.goto(home);
  await expect(page.locator('.directory-hero h1')).toContainText('Электротехника');
  await page.locator('.directory-hero').getByRole('link', { name: 'Учебник', exact: true }).click();
  await page.locator('#topic-dc-mesh').getByRole('link', { name: 'Учебник', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Метод контурных токов');
  await page.getByRole('link', { name: 'Следующий этап', exact: true }).click();
  await expect(page).toHaveURL(/examples/);
  await page.getByRole('link', { name: 'Следующий этап', exact: true }).click();
  await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('parameter-value').fill('5');
  await expect(page.getByTestId('parameter-value')).toHaveValue('5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#mvp-theme,#theme-toggle')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.mvp-brand').click();
  await expect(page.locator('.directory-hero')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('home keeps all three topic links usable without JavaScript at phone width', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto(home);
  await expect(page.locator('#topic-dc-mesh a')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('#topic-dc-mesh a[href$="/lab/"]').click();
  await expect(page.locator('.mesh-nojs')).toBeVisible();
  await context.close();
});
