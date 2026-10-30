import { expect, test } from '@playwright/test';

test('home uses the shared student shell and direct micro-lab cards',async({page})=>{
 await page.goto('/ru/');await expect(page.getByRole('link',{name:'Лаборатории',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Расчёт',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Доска',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Контакты'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Услуги',exact:true})).toHaveCount(0);await expect(page.locator('.lab-formats')).toHaveCount(0);await expect(page.locator('[data-learning-summary]')).toHaveCount(0);
 await expect(page.locator('.panorama-slide')).toHaveCount(4);const cards=page.locator('.home-laboratories .catalogue-card');await expect(cards).toHaveCount(8);expect(await page.locator('.home-laboratories .tool-card-link[href*="/micro-labs/"]').first().getAttribute('href')).toMatch(/\/micro-labs\/#micro=/);await page.reload();await expect(cards).toHaveCount(8);
});

test('laboratory catalogue keeps real tool links and honest services state',async({page})=>{
 await page.goto('/ru/interactive/');await expect(page.getByRole('heading',{name:'Лаборатории',exact:true})).toBeVisible();await expect(page.locator('.catalogue-card')).toHaveCount(12);expect(await page.locator('h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(44);await expect(page.locator('.tool-card-link[href*="/interactive/star-neutral/"]')).toBeVisible();await page.getByRole('button',{name:'Показать ещё',exact:true}).click();await expect(page.locator('.catalogue-card')).toHaveCount(31);
 await page.goto('/ru/my-services/');await expect(page.getByRole('heading',{name:'Дополнительные сервисы',exact:true})).toBeVisible();await expect(page.locator('#mathmorph').locator('..')).toContainText('пока не подключ');
});

test('home preview opens the actual selected electrical model',async({page})=>{
 await page.goto('/ru/');const link=page.locator('.home-laboratories .tool-card-link[href*="/micro-labs/"]').first();await expect(link).toBeVisible();const href=(await link.getAttribute('href'))!,id=new URL(href,'http://test').hash.split('=')[1];await link.click();const card=page.locator(`[data-micro="${id}"]`);await expect(card).toHaveAttribute('data-selected','true');await expect(page.locator('.micro-card[data-selected="true"]')).toHaveCount(1);const value=await card.locator('.micro-results').textContent();await card.locator('input[type=range]').first().press('End');await expect(card.locator('.micro-results')).not.toHaveText(value!);
});

test('catalog cards fit phone in both themes and languages; selection stays stable during interaction',async({page})=>{
 await page.setViewportSize({width:390,height:844});for(const lang of ['ru','uk']){await page.goto(`/${lang}/`);const cards=page.locator('.home-laboratories .catalogue-card');await expect(cards).toHaveCount(8);const first=await cards.evaluateAll(es=>es.map(e=>e.getAttribute('data-micro')));expect(new Set(first).size).toBe(8);await page.locator('#theme-toggle').click();expect(await cards.evaluateAll(es=>es.map(e=>e.getAttribute('data-micro')))).toEqual(first);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.goto(`/${lang}/interactive/`);await expect(page.locator('.catalogue-card')).toHaveCount(12);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);}
});
