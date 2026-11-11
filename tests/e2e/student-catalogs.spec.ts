import { expect, test } from '@playwright/test';

test('home uses the shared student shell and direct micro-lab cards',async({page})=>{
 await page.goto('/ru/');await expect(page.getByRole('link',{name:'Лаборатории',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Расчёт',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Доска',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Контакты'})).toBeVisible();await expect(page.getByRole('link',{name:'Услуги',exact:true})).toHaveCount(0);await expect(page.locator('.lab-formats')).toHaveCount(0);await expect(page.locator('[data-learning-summary]')).toHaveCount(0);
 await expect(page.locator('.panorama-slide')).toHaveCount(4);const cards=page.locator('#labs .directory-feature');await expect(cards).toHaveCount(5);expect(await page.locator('#labs a[href*="/micro-labs/#micro="]').first().getAttribute('href')).toMatch(/\/micro-labs\/#micro=/);await page.reload();await expect(cards).toHaveCount(5);
});

test('laboratory catalogue keeps real tool links and honest services state',async({page})=>{
 await page.goto('/ru/interactive/');await expect(page.getByRole('heading',{name:'Лаборатории',exact:true})).toBeVisible();await expect(page.locator('#labs [data-directory-entry]')).toHaveCount(31);expect(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(44);await expect(page.locator('#labs a[href$="/interactive/star-neutral/"]')).toBeVisible();
 await page.goto('/ru/my-services/');await expect(page.getByRole('heading',{name:'Дополнительные сервисы',exact:true})).toBeVisible();await expect(page.locator('#mathmorph').locator('..')).toContainText('пока не подключ');
});

test('home preview opens the actual selected electrical model',async({page})=>{
 await page.goto('/ru/');const link=page.locator('#labs a[href*="/micro-labs/#micro="]').first();await link.locator('xpath=ancestor::details/summary').click();await expect(link).toBeVisible();const href=(await link.getAttribute('href'))!,id=new URL(href,'http://test').hash.split('=')[1];await link.click();const card=page.locator(`[data-micro="${id}"]`);await expect(card).toHaveAttribute('data-selected','true');await expect(page.locator('.micro-card[data-selected="true"]')).toHaveCount(1);const value=await card.locator('.micro-results').textContent();await card.locator('input[type=range]').first().press('End');await expect(card.locator('.micro-results')).not.toHaveText(value!);
});

test('catalogue links fit on a phone and remain stable under either OS appearance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lang of ['ru', 'uk']) {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`/${lang}/`);
    const links = page.locator('#labs a');
    const before = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    expect(before).toHaveLength(lang === 'ru' ? 32 : 31);
    expect(new Set(before).size).toBe(before.length);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.goto(`/${lang}/interactive/`);
    await expect(page.locator('#labs a')).toHaveCount(before.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});
