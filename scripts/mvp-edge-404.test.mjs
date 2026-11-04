import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {edgeRoutes,edgeWorkerSource,assertEdge404} from './mvp-edge-404.mjs';
import {publicRoutes} from './public-mvp-contract.mjs';

const globalHeaders={
  'Content-Security-Policy':"default-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=()',
};
const headerText='/*\n'+Object.entries(globalHeaders).map(([k,v])=>`  ${k}: ${v}`).join('\n')+'\n/ru/\n  Cache-Control: no-cache\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const html='<html lang="ru"><meta name="robots" content="noindex"><h1>404</h1></html>';

async function fixture(base,changes={}) {
  const root=await mkdtemp(join(tmpdir(),'electrotutor-edge-'));
  const files={'404.html':html,'_headers':headerText,'_worker.js':edgeWorkerSource({html,headers:headerText}),'_routes.json':JSON.stringify(edgeRoutes(base)),...changes};
  await Promise.all(Object.entries(files).filter(([,body])=>body!==null).map(([file,body])=>writeFile(join(root,file),body)));
  return root; // Retained OS temp fixtures; no user/cache cleanup.
}

describe('bounded Pages404 delivery',()=>{
  it.each(['/', '/electro/'])('invokes only the two retired trees with base %s',base=>{
    const prefix=base==='/'?'':base.slice(0,-1), routes=edgeRoutes(base);
    expect(routes).toEqual({version:1,include:[`${prefix}/uk`,`${prefix}/uk/*`,`${prefix}/ru/interactive`,`${prefix}/ru/interactive/*`],exclude:[]});
    const invoked=path=>routes.include.some(pattern=>pattern.endsWith('*')?path.startsWith(pattern.slice(0,-1)):path===pattern);
    for(const path of [...publicRoutes,'/','/_astro/app.js','/icons/potential.svg','/sw.js']) expect(invoked(prefix+path)).toBe(false);
    for(const path of ['/uk','/uk/','/uk/index.html','/ru/interactive','/ru/interactive/','/ru/interactive/tool/']) expect(invoked(prefix+path)).toBe(true);
  });
  it('returns actual GET/HEAD/POST404 with full security policy and no input reflection',async()=>{
    const source=edgeWorkerSource({html,headers:headerText}), handler=(await import('data:text/javascript,'+encodeURIComponent(source))).default;
    for(const method of ['GET','HEAD','POST']) {
      const response=await handler.fetch(new Request('https://example.test/uk/?secret=never-reflect',{method,headers:{Authorization:'never-reflect'}}));
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(method==='HEAD'?'':html);
      for(const [key,value]of Object.entries({...globalHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','X-ElectroTutor-Route-Guard':'v1'})) expect(response.headers.get(key)).toBe(value);
      expect(response.headers.has('Location')).toBe(false);
    }
    expect(source).not.toMatch(/ASSETS|request\.(?:url|headers|body)|https:\/\//);
  });
  it.each(['/', '/electro/'])('accepts only the exact generated handler/config at base %s',async base=>{
    await expect(assertEdge404(await fixture(base),base,headerText)).resolves.toBeUndefined();
    for(const changes of [{'_worker.js':'tampered'},{'_worker.js':null},{'_routes.json':JSON.stringify({version:1,include:['/*'],exclude:[]})},{'_routes.json':null},{'404.html':'changed'}]) await expect(assertEdge404(await fixture(base,changes),base)).rejects.toThrow();
  });
  it('fails closed when the global security block is missing/incomplete',()=>{
    for(const headers of ['/ru/\n  Cache-Control: no-store\n','/*\n  X-Frame-Options: DENY\n']) expect(()=>edgeWorkerSource({html,headers})).toThrow();
  });
});
