import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicRoutes, publicPath } from './public-mvp-contract.mjs';
export function workerSource({pages,assets,fingerprint}) {
 return `const VERSION=${JSON.stringify(fingerprint)}, PAGES=${JSON.stringify(pages)}, ASSETS=${JSON.stringify(assets)};
const scope=new URL(self.registration.scope), key='potential-pwa-mvp-'+encodeURIComponent(scope.pathname)+'-'+VERSION;
const absolute=p=>new URL(p,scope.origin).href;
const allowed=new Set([...PAGES,...ASSETS].map(absolute));
const notFound=()=>new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Страница недоступна</title><h1>Страница недоступна в публичной версии</h1></html>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
const safe=response=>response.ok&&response.status!==206&&!/no-store|private/i.test(response.headers.get('cache-control')||'')&&response.headers.get('vary')!=='*';
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(key);await cache.addAll([...allowed]);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys()) {
  if(name===key||!(/^potential-pwa-v[0-9]+$/.test(name)||name.startsWith('potential-pwa-mvp-'+encodeURIComponent(scope.pathname)+'-')))continue;
  const cache=await caches.open(name);
  for(const request of await cache.keys()) {const url=new URL(request.url);if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname))await cache.delete(request);}
  if((await cache.keys()).length===0)await caches.delete(name);
 }
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 if(request.mode==='navigate') {
  if(!PAGES.includes(url.pathname)){event.respondWith(Promise.resolve(notFound()));return;}
  event.respondWith((async()=>{const cache=await caches.open(key);try{const response=await fetch(request);if(safe(response))await cache.put(url.origin+url.pathname,response.clone());return response;}catch{ return (await cache.match(url.origin+url.pathname))||(await cache.match(new URL('offline.html',scope).href))||new Response('Нет подключения',{status:503});}})());return;
 }
 if(!allowed.has(url.href)||url.search)return;
 event.respondWith((async()=>{const cache=await caches.open(key),hit=await cache.match(request,{ignoreVary:true});if(hit)return hit;const response=await fetch(request);if(safe(response))await cache.put(request,response.clone());return response;})());
});`;
}
export function mvpWorkerIntegration(base) {
 return {name:'electrotutor-mvp-worker',hooks:{'astro:build:done':async({dir})=>{
  const root=fileURLToPath(dir),files=[];
  async function walk(p){for(const item of await readdir(p,{withFileTypes:true})){const f=join(p,item.name);if(item.isDirectory())await walk(f);else files.push(f);}}
  await walk(root);files.sort();const hash=createHash('sha256');
  for(const file of files){if(file.endsWith('sw.js'))continue;hash.update(relative(root,file));hash.update(await readFile(file));}
  const assets=files.map(f=>relative(root,f).replaceAll('\\','/')).filter(f=>f.startsWith('_astro/')||f.startsWith('icons/')||['offline.html','manifest.webmanifest'].includes(f)).map(f=>publicPath('/'+f,base));
  await writeFile(join(root,'sw.js'),workerSource({pages:['/',...publicRoutes].map(p=>publicPath(p,base)),assets,fingerprint:hash.digest('hex').slice(0,20)}));
 }}};
}
