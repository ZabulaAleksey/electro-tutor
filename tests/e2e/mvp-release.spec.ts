import {test,expect} from '@playwright/test';
declare global { interface Window { releaseViolations: unknown[]; } }
const base=process.env.E2E_BASE_PATH||'/',book=base+'ru/topics/dc/mesh-current-method/';

test('release metadata is coherent on all seven public pages without JavaScript',async({browser,request})=>{
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
 for(const path of ['ru/','ru/help/','ru/contacts/','ru/privacy/',book.slice(base.length),book.slice(base.length)+'examples/',book.slice(base.length)+'lab/']){
  await page.goto(base+path);const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content',canonical!);await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content',await page.title());
  expect(await page.locator('meta[property="og:description"]').getAttribute('content')).toBe(await page.locator('meta[name="description"]').getAttribute('content'));
 }
 await page.goto(book);await expect(page.locator('.katex')).toHaveCount(129);await page.goto(book+'examples/');await expect(page.locator('.katex')).toHaveCount(129);
 const robots=await(await request.get(base+'robots.txt')).text();expect(robots).not.toContain('Disallow:');await context.close();
});

test('enforced release CSP allows light navigation practice four schemes and offline hydration',async({browser,request})=>{
 test.skip(process.env.E2E_RELEASE_HEADERS!=='1','Run against release:preview to apply emitted HTTP policy; Astro preview does not apply _headers');
 const context=await browser.newContext(),page=await context.newPage();
 await context.addInitScript(()=>{window.releaseViolations=[];document.addEventListener('securitypolicyviolation',e=>window.releaseViolations.push({directive:e.violatedDirective,blocked:e.blockedURI}));});
 const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))external.push(r.url());});
 async function noViolation(){expect(await page.evaluate(()=>window.releaseViolations)).toEqual([]);}
 for(const path of ['ru/','ru/help/','ru/contacts/','ru/privacy/']){const response=await page.goto(base+path);expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");await noViolation();}
 await page.goto(book);await expect(page.locator('#practice-answer')).toBeEnabled();await page.locator('#practice-answer').fill('2.18');await page.getByRole('button',{name:'Проверить',exact:true}).click();await expect(page.getByText('Верно. Сравните результат с выводом в учебнике.',{exact:true})).toBeVisible();await noViolation();
 await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page).toHaveURL(book+'examples/#example-1');await noViolation();await page.getByRole('link',{name:'Следующий этап',exact:true}).click();await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');
 const expected=['3,60 A','1,20 A','8,82 A','2,67 A'];
 for(let n=1;n<=4;n++){await page.getByTestId('preset').selectOption(String(n));await expect(page.getByTestId('mesh-1')).toHaveText(expected[n-1]);await page.getByTestId('parameter-value').fill('3');await expect(page.getByRole('alert')).toHaveCount(0);await page.getByRole('button',{name:'Сброс параметров'}).click();await noViolation();}
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('#mvp-theme,#theme-toggle')).toHaveCount(0);await noViolation();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await context.setOffline(true);await page.goto(book+'lab/?example=4');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await noViolation();await context.setOffline(false);
 for(const path of ['sw.js','manifest.webmanifest'])expect((await request.get(base+path)).headers()['cache-control']).toBe('no-cache');
 const hidden=await page.goto(base+'uk/');expect(hidden?.status()).toBe(404);await noViolation();expect(errors).toEqual([]);expect(external).toEqual([]);await context.close();
});
