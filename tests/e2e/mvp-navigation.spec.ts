import {test,expect} from '@playwright/test';
const base=process.env.E2E_BASE_PATH||'/',book=base+'ru/topics/dc/mesh-current-method/';
test('public contents keeps three independent menu stages and only approved mesh links',async({page,request})=>{
 for(const route of [base+'ru/',book,book+'examples/',book+'lab/',base+'ru/help/']){
  await page.goto(route);await expect(page.locator('[data-learning-menu] a')).toHaveText(['Учебник','Примеры решений','Лаборатория']);await page.locator('[data-learning-contents] > summary').click();await expect(page.locator('[data-learning-entry]')).toHaveCount(1);await expect(page.locator('[data-learning-entry] .learning-entry-stages a')).toHaveCount(3);
  const hrefs=await page.locator('[data-learning-contents] a').evaluateAll(links=>links.map(a=>(a as HTMLAnchorElement).pathname));expect(hrefs.every(h=>h.startsWith(book))).toBe(true);
 }
 for(const route of ['uk/','ru/topics/','ru/interactive/','ru/classroom/','ru/micro-labs/'])expect((await request.get(base+route)).status()).toBe(404);
});
test('public stage menu uses current example and contents works after client transitions',async({page})=>{
 await page.goto(book+'examples/#example-3');await page.locator('[data-learning-menu] a').filter({hasText:'Лаборатория'}).click();await expect(page).toHaveURL(/lab\/\?example=3/);await expect(page.getByTestId('preset')).toHaveValue('3');await page.goBack();await expect(page).toHaveURL(/examples\/#example-3/);await page.locator('[data-learning-contents] > summary').click();await page.locator('[data-learning-search]').fill('нет такой темы');await expect(page.locator('[data-learning-empty]')).toBeVisible();await page.locator('[data-learning-search]').fill('контур');await expect(page.locator('[data-learning-entry]:visible')).toHaveCount(1);
});

test('six-width two-theme stage rail stays below the actual header',async({browser})=>{
 for(const theme of ['light','dark'] as const){const context=await browser.newContext({colorScheme:theme,serviceWorkers:'block'}),page=await context.newPage();for(const width of [320,375,390,768,1280,1920]){await page.setViewportSize({width,height:900});await page.goto(book);await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');await page.evaluate(()=>scrollTo(0,900));const header=await page.locator('.astro-header,.mvp-header').boundingBox(),rail=await page.locator('.journey-rail').boundingBox();expect(rail!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await context.close();}
});
