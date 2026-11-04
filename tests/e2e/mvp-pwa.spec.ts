import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
const base=process.env.E2E_BASE_PATH||'/',book=base+'ru/topics/dc/mesh-current-method/';
test('actual MVP worker precaches all stages for offline use and denies hidden URLs offline',async({browser,request})=>{
 const context=await browser.newContext();const page=await context.newPage();await page.goto(base+'ru/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const manifest=await(await request.get(base+'manifest.webmanifest')).json();expect(manifest.lang).toBe('ru');expect(manifest.shortcuts.map((x:{url:string})=>x.url)).toEqual([book,book+'examples/',book+'lab/']);
 await context.setOffline(true);await page.goto(book+'lab/?example=4');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');await page.getByTestId('parameter-value').fill('3');await expect(page.getByRole('alert')).toHaveCount(0);const hidden=await page.goto(base+'uk/');expect(hidden?.status()).toBe(404);expect(await page.content()).toContain('noindex');await context.close();
});
test('real legacy v2 to MVP cache upgrade removes hidden pages and preserves unrelated storage',async({browser})=>{
 test.skip(!process.env.MVP_LEGACY_ARTIFACT,'Requires the locally verified full-mode artifact for real legacy worker upgrade');
 let root=resolve(process.env.MVP_LEGACY_ARTIFACT!);const mvp=resolve(process.env.BUILD_OUTPUT_DIR!);
 const mime=(p:string)=>p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':p.endsWith('.webmanifest')?'application/manifest+json':p.endsWith('.woff2')?'font/woff2':p.endsWith('.woff')?'font/woff':p.endsWith('.json')?'application/json':'text/html; charset=utf-8';
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url!,'http://x'),route=decodeURIComponent(url.pathname),file=resolve(root,'.'+route+(route.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}let data;try{data=await readFile(file);}catch{res.writeHead(404,{'Content-Type':'text/html'});res.end(await readFile(resolve(root,'404.html')));return;}res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(500).end();}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address() as {port:number},origin='http://127.0.0.1:'+addr.port;const context=await browser.newContext();const page=await context.newPage();await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 try{
  await page.goto(origin+'/ru/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async()=>{const legacy=await caches.open('potential-pwa-v2');await legacy.put('/uk/',new Response('OLD HIDDEN UK'));const other=await caches.open('other-app-user-data');await other.put('/unique-state',new Response('KEEP'));localStorage.setItem('unrelated-user-data','KEEP');});
  root=mvp;await page.goto(origin+'/ru/');await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});await expect.poll(()=>page.evaluate(async()=> (await caches.keys()).some(k=>k.startsWith('potential-pwa-mvp-'))),{timeout:30000}).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{for(const k of await caches.keys())if(k.startsWith('potential-pwa-')&&(await(await caches.open(k)).keys()).some(r=>new URL(r.url).pathname==='/uk/'))return false;return true;})).toBe(true);
  expect(await page.evaluate(async()=>({other:await(await(await caches.open('other-app-user-data')).match('/unique-state'))?.text(),local:localStorage.getItem('unrelated-user-data')}))).toEqual({other:'KEEP',local:'KEEP'});
  await context.setOffline(true);await page.goto(origin+'/ru/topics/dc/mesh-current-method/lab/');await expect(page.locator('.mesh-lab')).toHaveAttribute('data-ready','true');const hidden=await page.goto(origin+'/uk/');expect(hidden?.status()).toBe(404);
 }finally{await context.close();await new Promise<void>(r=>server.close(()=>r()));}
});
