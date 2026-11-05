import {test,expect} from '@playwright/test';
const book='/ru/topics/dc/mesh-current-method/', mesh='[data-entry-id="topic:dc/mesh"]', fourier='[data-entry-id="tool:advanced:fourier"]';
const contents='[data-learning-contents]';
async function open(page:import('@playwright/test').Page){await page.locator(contents+' > summary').click();await expect(page.locator('[data-learning-search]')).toBeVisible();}

test('one derived contents exposes 20 definitions,31 tools and honest missing stages globally',async({page})=>{
 for(const route of ['/ru/','/ru/topics/','/ru/interactive/','/ru/my-services/',book,book+'examples/',book+'lab/']){
  await page.goto(route);await expect(page.locator('[data-learning-entry]')).toHaveCount(51);
  await expect(page.locator('[data-learning-menu] a')).toHaveText(['Учебник','Примеры решений','Лаборатория']);expect(await page.locator('[data-learning-menu] [aria-current]').count()).toBeLessThanOrEqual(1);
 }
 await open(page);await expect(page.locator(mesh+' .learning-entry-stages a')).toHaveCount(3);
 const magnetic=page.locator('[data-entry-id^="topic:magnetic/"]');expect(await magnetic.count()).toBeGreaterThan(0);await expect(magnetic.locator('.learning-entry-stages a')).toHaveCount(0);
 await page.locator('[data-learning-search]').fill('Фурье');await expect(page.locator('[data-learning-entry]:visible')).toHaveCount(1);await expect(page.locator(fourier)).toBeVisible();
 await page.locator('[data-learning-search]').fill('<script>none</script>');await expect(page.locator('[data-learning-empty]')).toBeVisible();await expect(page.locator('[data-learning-entry]:visible')).toHaveCount(0);
 await page.locator('[data-learning-search]').fill('');await expect(page.locator('[data-learning-entry]:visible')).toHaveCount(51);
});

test('requested examples survives topic switch, lab fallback, direct reload and Back/Forward',async({page})=>{
 await page.goto('/ru/topics/?learningStage=examples');await open(page);
 await expect(page.locator(mesh+' [data-learning-target]')).toHaveAttribute('href',/mesh-current-method\/examples\//);
 await expect(page.locator(fourier+' .learning-entry-fallback')).toBeVisible();
 await page.locator(fourier+' [data-learning-target]').click();await expect(page).toHaveURL(/interactive\/fourier\/\?learningStage=examples/);
 await open(page);await expect(page.locator(fourier)).toHaveClass(/learning-entry-current/);await expect(page.locator(mesh+' [data-learning-target]')).toHaveAttribute('href',/mesh-current-method\/examples\//);
 await page.locator(mesh+' [data-learning-target]').click();await expect(page).toHaveURL(/mesh-current-method\/examples\//);await page.reload();await open(page);await expect(page.locator('[data-learning-stage]')).toHaveValue('examples');
 await page.goBack();await expect(page).toHaveURL(/interactive\/fourier/);await page.goForward();await expect(page).toHaveURL(/mesh-current-method\/examples/);
});

test('all31 tool targets and reference variant use real pages and preserve hash selectors',async({page,request})=>{
 await page.goto('/ru/topics/');await open(page);
 const tools=await page.locator('[data-entry-id^="tool:"] .learning-entry-stages a').evaluateAll(links=>links.map(a=>({id:a.closest('[data-entry-id]')!.getAttribute('data-entry-id')!,href:(a as HTMLAnchorElement).getAttribute('href')!})));
 expect(tools).toHaveLength(31);const paths=new Set<string>();
 for(const tool of tools){const u=new URL(tool.href,'http://local');paths.add(u.pathname);expect((await request.get(u.pathname)).status(),tool.id).toBe(200);if(u.hash)expect(u.hash).toMatch(/^#(micro|science)=/);}
 for(const route of paths){await page.goto(route);await expect(page.locator('[data-learning-contents]')).toHaveCount(1);await expect(page.locator('h1')).not.toBeEmpty();}
 await page.goto('/ru/topics/');await open(page);const line=page.locator('[data-entry-id="tool:advanced:transmission-line"]');await line.locator('.learning-entry-links a').click();await expect(page).toHaveURL(/transmission-line-reference/);await expect(page.locator('h1')).not.toBeEmpty();await open(page);await expect(page.locator('[data-learning-stage]')).toHaveValue('lab');
 await page.goto('/ru/micro-labs/?learningStage=lab#micro=capacitor-charge');await open(page);await expect(page.locator('[data-entry-id="tool:micro:capacitor-charge"]')).toHaveClass(/learning-entry-current/);
});

test('menu and shared contents preserve example context and full mesh rail retains native scroll',async({page})=>{
 await page.goto(book+'examples/#example-4');await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');await page.locator('[data-learning-menu] a').filter({hasText:'Лаборатория'}).click();await expect(page).toHaveURL(/lab\/\?example=4/);await expect(page.getByTestId('preset')).toHaveValue('4');
 await page.getByTestId('parameter-value').fill('3');await page.locator('[data-learning-menu] a').filter({hasText:'Примеры решений'}).click();await expect(page).toHaveURL(/examples\/#example-4/);
 await open(page);await page.locator(mesh+' .learning-entry-stages a').filter({hasText:'Лаборатория'}).click();await expect(page.getByTestId('parameter-value')).toHaveValue('3');
 await page.locator('.journey-rail').focus();await page.keyboard.press('Home');await expect(page).toHaveURL(book);await page.mouse.move(180,450);await page.mouse.wheel(0,600);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(250);await expect(page).toHaveURL(book);
});

test('contents keyboard Escape, denied storage, noJS and UK language availability',async({browser})=>{
 const context=await browser.newContext();await context.addInitScript(()=>{for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){throw Error('denied')}})});const page=await context.newPage();await page.goto('/ru/topics/');const summary=page.locator(contents+' > summary');await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('[data-learning-search]')).toBeVisible();await page.locator('[data-learning-search]').focus();await page.keyboard.press('Escape');await expect(summary).toBeFocused();await expect(page.locator(contents)).not.toHaveAttribute('open','');await context.close();
 const nojs=await browser.newContext({javaScriptEnabled:false});const p=await nojs.newPage();await p.goto('/uk/topics/dc/mesh-current-method/');await open(p);await expect(p.locator('[data-learning-entry]')).toHaveCount(51);await expect(p.locator(mesh+' .learning-entry-stages a')).toHaveCount(1);await expect(p.locator(mesh)).toContainText('Немає перекладу');await p.locator(fourier+' .learning-entry-stages a').click();await expect(p).toHaveURL(/uk\/interactive\/fourier/);await nojs.close();
});

test('explicit textbook preference overrides current lab and restores with history',async({page})=>{
 await page.goto(book+'lab/?example=4&reset=1');await open(page);await expect(page.locator(mesh)).toHaveClass(/learning-entry-current/);
 await page.locator('[data-learning-stage]').selectOption('textbook');await expect(page.locator('[data-learning-stage]')).toHaveValue('textbook');await expect(page.locator(mesh+' [data-learning-target]')).toHaveAttribute('href',/mesh-current-method\/$/);
 await page.locator('[data-learning-stage]').selectOption('examples');await expect(page.locator('[data-learning-stage]')).toHaveValue('examples');await page.goBack();await expect(page.locator('[data-learning-stage]')).toHaveValue('textbook');await page.goForward();await expect(page.locator('[data-learning-stage]')).toHaveValue('examples');
});

test('global header opener reveals contents at reading position and returns keyboard focus',async({page})=>{
 await page.goto(book);await page.evaluate(()=>scrollTo(0,1800));const before=await page.evaluate(()=>scrollY);const opener=page.locator('[data-learning-open]');await opener.click();await expect(page.locator('[data-learning-search]')).toBeFocused();expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(3);await page.keyboard.press('Escape');await expect(opener).toBeFocused();
});

test('six-width two-theme stage rail stays below the actual header',async({browser})=>{
 for(const theme of ['light','dark'] as const){const context=await browser.newContext({colorScheme:theme,serviceWorkers:'block'}),page=await context.newPage();for(const width of [320,375,390,768,1280,1920]){await page.setViewportSize({width,height:900});await page.goto(book);await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');await page.evaluate(()=>scrollTo(0,900));const header=await page.locator('.astro-header,.mvp-header').boundingBox(),rail=await page.locator('.journey-rail').boundingBox();expect(rail!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}await context.close();}
});

test('mobile contents opened from menu returns focus to the visible menu toggle',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto(book);const toggle=page.locator('#mobile-menu-toggle');await toggle.click();await page.locator('[data-learning-open]').click();await expect(page.locator('[data-learning-search]')).toBeFocused();await page.keyboard.press('Escape');await expect(toggle).toBeFocused();
});

test('desktop menu labels remain inside the header with independent stages',async({page})=>{
 for(const width of [1280,1920]){await page.setViewportSize({width,height:900});await page.goto('/ru/');const header=await page.locator('.astro-header').boundingBox();for(const a of await page.locator('.astro-header nav a:visible, .astro-header nav > details > summary').all()){const box=await a.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(header!.y-1);expect(box!.y+box!.height).toBeLessThanOrEqual(header!.y+header!.height+1);}expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
});

test('direct experiment bookmarks keep the lab preference and current tool',async({page})=>{
 await page.goto('/ru/interactive/fourier/?harmonics=4');await open(page);await expect(page.locator('[data-learning-stage]')).toHaveValue('lab');await expect(page.locator(fourier)).toHaveClass(/learning-entry-current/);await expect(page.locator(mesh+' [data-learning-target]')).toHaveAttribute('href',/mesh-current-method\/lab\//);
});
