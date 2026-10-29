import { expect, test } from '@playwright/test';
import { validateFourierConfig } from '../../src/fourier/config';

test('an earlier RAF timestamp cannot make a saved Fourier phase negative', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const schedule = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => schedule(() => callback(0));
  });
  await page.goto('/ru/interactive/fourier/');
  const lab = page.locator('[data-fourier-lab]');
  await lab.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('electrotutor-fourier-config')!));
  expect(saved.phase).toBe(0);
  expect(validateFourierConfig(saved)).toBe(true);
});
