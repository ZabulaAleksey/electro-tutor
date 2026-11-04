import {test,expect,type Page} from '@playwright/test';
const base=process.env.E2E_BASE_PATH||'/',book=base+'ru/topics/dc/mesh-current-method/',examples=book+'examples/',lab=book+'lab/';
async function ready(page:Page){await expect(page.locator('.journey-content')).toHaveAttribute('data-gesture-ready','true');}
test('three direct URLs, current stage, buttons and browser Back/Forward preserve reading position',async({page})=>{
 await page.goto(book);await ready(page);await expect(page.locator('h1')).toHaveText('Метод контурных токов');
 await page.evaluate(()=>scrollTo(0,1600));await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(1500);
 await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page).toHaveURL(examples+'#example-1');await ready(page);await expect(page.locator('[aria-current="step"]')).toHaveText('2Примеры решений');
 await page.goBack();await expect(page).toHaveURL(book);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(1400);
 await page.goForward();await expect(page).toHaveURL(examples+'#example-1');
 await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page).toHaveURL(lab+'?example=1');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');
 await expect(page.locator('h1')).toBeFocused();await page.reload();await expect(page.getByTestId('preset')).toHaveValue('1');
});
test('keyboard rail, no vertical wheel interception and horizontal trackpad',async({page})=>{
 await page.goto(book);await ready(page);const rail=page.locator('.journey-rail');await rail.focus();await page.keyboard.press('End');await expect(page).toHaveURL(lab+'?example=1');await ready(page);
 await page.locator('.journey-rail').focus();await page.keyboard.press('Home');await expect(page).toHaveURL(book);await ready(page);
 await page.mouse.move(150,85);await page.mouse.wheel(0,600);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(300);await expect(page).toHaveURL(book);
 await page.mouse.move(150,85);await page.mouse.wheel(130,0);await expect(page).toHaveURL(examples+'#example-1');
});
test('mouse drag is scoped to rail and selection in article does not navigate',async({page})=>{
 await page.goto(book);await ready(page);const r=await page.locator('[data-step="1"]').boundingBox();await page.mouse.move(r!.x+r!.width*.8,r!.y+r!.height/2);await page.mouse.down();await page.mouse.move(r!.x+r!.width*.8-220,r!.y+r!.height/2,{steps:8});await page.mouse.up();await expect(page).toHaveURL(examples+'#example-1');
 await ready(page);await page.locator('h1').evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,pointerType:'mouse',isPrimary:true,button:0,bubbles:true,clientX:280,clientY:260}));el.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,pointerType:'mouse',isPrimary:true,button:0,bubbles:true,clientX:50,clientY:260}));});await expect(page).toHaveURL(examples+'#example-1');
});
test('actual mobile touch horizontal swipe and native vertical pan',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto(book);await ready(page);const cdp=await context.newCDPSession(page);
 const swipe=async(x:number,y:number,x2:number,y2:number)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(x2-x)*i/8,y:y+(y2-y)*i/8}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await swipe(180,650,180,270);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(200);await expect(page).toHaveURL(book);
 await page.evaluate(()=>scrollTo(0,0));await swipe(340,290,40,290);await expect(page).toHaveURL(examples+'#example-1');await context.close();
});
test('lab changes immediately, keeps experiment across journey and resets baseline explicitly',async({page})=>{
 await page.goto(lab+'?example=4&reset=1');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');const old=await page.getByTestId('mesh-1').textContent();await page.getByTestId('parameter-value').fill('3');await expect(page.getByTestId('mesh-1')).not.toHaveText(old!);
 await page.getByRole('link',{name:'Предыдущий этап',exact:true}).click();await expect(page).toHaveURL(examples+'#example-4');await ready(page);await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page.getByTestId('parameter-value')).toHaveValue('3');await page.reload();await expect(page.getByTestId('parameter-value')).toHaveValue('3');
 await page.goto(examples);await page.getByRole('link',{name:'Открыть в лаборатории пример 4 →',exact:true}).click();await expect(page.getByTestId('parameter-value')).toHaveValue('2');
 await page.getByTestId('parameter-value').fill('0');await expect(page.getByRole('alert')).toHaveCount(0);await page.getByTestId('parameter-value').fill('-1');await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Сброс параметров'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});
test('no account requests, storage denial and malformed context keep static solver usable',async({browser})=>{
 const context=await browser.newContext();await context.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('denied');}});});const page=await context.newPage(),requests:string[]=[];page.on('request',r=>{if(/\/api\/|localhost|:8000/.test(r.url()))requests.push(r.url());});await page.goto(lab);await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await page.getByTestId('parameter-value').fill('5');await expect(page.getByRole('alert')).toHaveCount(0);expect(requests).toEqual([]);await context.close();
});
test('no JavaScript retains three stage links, textbook, examples and honest lab fallback',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto(book);await expect(page.locator('.lesson-section')).toHaveCount(5);await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page.locator('#example-4')).toBeVisible();await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page.locator('.mesh-nojs')).toBeVisible();await expect(page.getByTestId('preset')).toBeDisabled();await context.close();
});
test('public URLs, canonical, sitemap, robots, contacts and hidden 404 routes',async({request,page})=>{
 const root=await(await request.get(base)).text();expect(root).toContain('lang="ru"');expect(root).toContain('noindex');expect(root).toContain('Перейти на главную');
 for(const p of ['ru/','ru/help/','ru/privacy/','ru/contacts/',book.slice(base.length),examples.slice(base.length),lab.slice(base.length)])expect((await request.get(base+p)).status()).toBe(200);
 for(const p of ['uk/','ru/topics/','ru/interactive/','ru/account/','ru/board/','ru/services/','ru/topics/ac/ohm-law/']){const response=await request.get(base+p);expect(response.status(),p).toBe(404);expect(await response.text()).toContain('noindex');}
 const sitemap=await(await request.get(base+'sitemap-0.xml')).text();expect([...sitemap.matchAll(/<loc>/g)]).toHaveLength(7);expect(sitemap).not.toContain('/uk/');expect((await(await request.get(base+'robots.txt')).text())).toContain('sitemap-index.xml');
 await page.goto(base+'ru/contacts/');await expect(page.getByRole('link',{name:'aleksey.zabula@gmail.com',exact:true})).toHaveAttribute('href','mailto:aleksey.zabula@gmail.com');await expect(page.getByRole('link',{name:'t.me/toemath',exact:true})).toHaveAttribute('href','https://t.me/toemath');await expect(page.locator('link[hreflang="uk"]')).toHaveCount(0);
});

test('Astro client transitions preserve React hydration and laboratory heading focus',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydrat|server rendered|React error #418/i.test(m.text()))errors.push(m.text());});
 await page.goto(book);await expect(page.locator('#practice-answer')).toBeEnabled();
 for(let i=0;i<2;i++){
  await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page).toHaveURL(examples+'#example-1');await expect(page.locator('.mesh-journey')).toHaveAttribute('data-stage','1');await ready(page);await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page).toHaveURL(lab+'?example=1');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await expect(page.locator('h1')).toBeFocused();
  await page.locator('[data-step="0"]').click();await expect(page).toHaveURL(book);await expect(page.locator('#practice-answer')).toBeEnabled();
 }
 expect(errors).toEqual([]);
});

test('invalid example URL overrides a saved experiment with the stated baseline',async({page})=>{
 await page.goto(lab+'?example=4&reset=1');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await page.getByTestId('parameter-value').fill('3');
 await page.goto(lab+'?example=9');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('preset')).toHaveValue('1');await expect(page.getByTestId('parameter-value')).toHaveValue('2');await expect(page.getByText('Неизвестный пример в ссылке: открыт исходный пример №1.',{exact:true})).toBeVisible();
 await page.evaluate(()=>sessionStorage.setItem('potential-mesh-lab:mvp:v1','{broken'));await page.goto(lab);await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await expect(page.getByTestId('preset')).toHaveValue('1');
});

test('help contacts and privacy fit all six widths in both themes',async({browser})=>{
 for(const theme of ['light','dark'] as const){const context=await browser.newContext({colorScheme:theme,serviceWorkers:'block'}),page=await context.newPage();
  for(const width of [320,375,390,768,1280,1920]){await page.setViewportSize({width,height:900});for(const route of ['help','contacts','privacy']){await page.goto(base+'ru/'+route+'/');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);const heading=await page.locator('h1').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));expect(heading.scroll).toBeLessThanOrEqual(heading.client+1);}}
  await context.close();
 }
});
