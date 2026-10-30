import { expect, test, type Page } from '@playwright/test';

async function selectStory(page:Page,id:string){await page.evaluate(id=>{location.hash=`story=${id}`},id);const scene=page.locator(`[data-scene="${id}"]`);await scene.scrollIntoViewIfNeeded();await expect(scene).toBeVisible();return scene;}

test('real DC controls retain parameters across bookmarked stories and permanent link reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/ru/#story=dc-series');
 await selectStory(page,'dc-series');await page.getByRole('slider',{name:'ЭДС E, V',exact:true}).fill('48');await expect(page.locator('[data-result="I"]')).toContainText('0,48');
 await selectStory(page,'ac-rlc');await selectStory(page,'dc-series');await expect(page.getByRole('slider',{name:'ЭДС E, V',exact:true})).toHaveValue('48');
 await selectStory(page,'rc-charge');await expect(page).toHaveURL(/#story=rc-charge$/);await page.reload();await expect(page.locator('[data-scene="rc-charge"]')).toBeVisible();await expect(page.locator('.katex-error')).toHaveCount(0);expect(errors).toEqual([]);
});

test('AC parameter changes update RMS results and RC has a pausable physical timeline',async({page})=>{
 await page.goto('/ru/#story=ac-rlc');await selectStory(page,'ac-rlc');const current=page.locator('[data-result="I RMS"]'),first=await current.innerText();await page.getByRole('slider',{name:'Частота f, Hz',exact:true}).fill('100');await expect(current).not.toHaveText(first);
 const rc=await selectStory(page,'rc-charge');await expect.poll(()=>rc.locator('[data-model-time]').innerText()).not.toContain(' 0 s');await rc.getByRole('button',{name:'Пауза',exact:true}).click();const paused=await rc.locator('[data-model-time]').innerText();await page.waitForTimeout(250);await expect(rc.locator('[data-model-time]')).toHaveText(paused);
 await rc.getByRole('slider',{name:'Ёмкость C, µF',exact:true}).fill('2000');await expect(rc.locator('[data-result="τ"]')).toContainText('2');
});

test('catalog searches real tools and bookmarked software examples remain explicitly illustrative',async({page})=>{
 await page.goto('/ru/interactive/');await page.getByRole('searchbox').fill('Фурье');await expect(page.locator('.catalogue-card')).toHaveCount(1);await page.locator('.catalogue-card').click();await expect(page).toHaveURL(/interactive\/fourier\/$/);
 await page.goto('/ru/#story=python-rc');const scene=await selectStory(page,'python-rc');await expect(scene.locator('.lab-code code')).toContainText('exp');await expect(scene.locator('.lab-code small')).not.toBeEmpty();await expect(scene.getByRole('slider')).toHaveCount(0);
 await page.goto('/ru/interactive/');await page.getByRole('searchbox').fill('Python');await expect(page.locator('.catalogue-card')).toHaveCount(0);await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
});

test('reduced motion stops autoplay and physical clock; direct story survives locale change',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/ru/#story=rc-charge');await expect(page.locator('[data-scene="rc-charge"]')).toHaveAttribute('data-motion','paused');const before=await page.locator('[data-model-time]').innerText();await page.waitForTimeout(300);await expect(page.locator('[data-model-time]')).toHaveText(before);await expect(page.locator('.panorama-showroom')).toHaveAttribute('data-autoplay','false');
 await page.locator('a[data-language-link]').click();await expect(page).toHaveURL(/\/uk\/#story=rc-charge$/);await expect(page.locator('[data-scene="rc-charge"]')).toBeVisible();
});

test('automatic panorama rotation is eight seconds and pauses offscreen',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const start=new Date('2030-01-01T00:00:00Z');await page.clock.install({time:start});await page.clock.pauseAt(new Date(start.getTime()+1000));await page.goto('/ru/');await page.mouse.move(5,80);const carousel=page.locator('.panorama-showroom');await expect(carousel).toHaveAttribute('data-autoplay','true');await page.clock.fastForward(7900);await expect(carousel).toHaveAttribute('data-panorama-index','0');await page.clock.fastForward(200);await expect(carousel).toHaveAttribute('data-panorama-index','1');await page.locator('.home-textbook').scrollIntoViewIfNeeded();await expect(carousel).toHaveAttribute('data-autoplay','false');
});

test('mobile touch swipe selects the next panorama without page overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/ru/');await expect(page.locator('.panorama-showroom')).toHaveAttribute('data-autoplay','false');const cdp=await page.context().newCDPSession(page),box=(await page.locator('.panorama-slides').boundingBox())!,y=box.y+100;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+280,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+110,y:y+2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.panorama-showroom')).toHaveAttribute('data-panorama-index','1');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

const scenes=['dc-series','ac-rlc','balanced-star','rc-charge','diode-load-line','magnetic-gap','floating-neutral','line-reflection'];
test('short desktop keeps complete plots and result links inside every bookmarked scene',async({page})=>{
 await page.setViewportSize({width:1440,height:768});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/ru/');
 for(const id of scenes){await selectStory(page,id);expect(await page.locator('.lab-showcase').evaluate(e=>{const f=e.getBoundingClientRect();return [...e.querySelectorAll('.lab-plot,.lab-result-footer,.lab-assumption')].every(e=>e.getBoundingClientRect().bottom<=f.bottom+1)}),`${id} clipped`).toBe(true);}
});

for(const language of ['ru','uk'] as const)for(const theme of ['light','dark'] as const)test(`${language} ${theme} every bookmarked scene has visible schematics and no overflow at mobile and desktop`,async({page})=>{
 await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
 for(const width of [390,1440]){await page.setViewportSize({width,height:width===390?844:1000});await page.goto(`/${language}/`);for(const id of scenes){const scene=await selectStory(page,id);await expect(scene.locator('.lab-circuit,.surface-circuit').first()).toBeVisible();await expect(page.locator('.katex-error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${id}/${width}`).toBeLessThanOrEqual(width);expect(await page.locator('.lab-showcase').evaluate(e=>{const f=e.getBoundingClientRect();return [...e.querySelectorAll('.lab-plot,.lab-result-footer,.lab-assumption')].every(e=>e.getBoundingClientRect().bottom<=f.bottom+1)}),`${id}/${width} clipping`).toBe(true);}}
});
