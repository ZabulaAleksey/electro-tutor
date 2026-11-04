import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retiredRewrites,retiredPolicy,assertRetiredRoutes} from './mvp-retired-routes.mjs';
async function fixture(base='/', redirects=retiredRewrites(base), extra=undefined, has404=true) { const root=await mkdtemp(join(tmpdir(),'electrotutor-retired-')); if(has404) await writeFile(join(root,'404.html'),'404'); await writeFile(join(root,'_redirects'),redirects); if(extra) await extra(root); return root; }
describe('MVP retired routes',()=>{
 it('generates exact root and subtree proxies',()=>expect(retiredRewrites('/')).toBe('/uk /__mvp_not_found__ 200\n/uk/* /__mvp_not_found__ 200\n/ru/interactive /__mvp_not_found__ 200\n/ru/interactive/* /__mvp_not_found__ 200\n'));
 it('is base aware and keeps a single absent target',()=>{const p=retiredPolicy('/electro/'); expect(p.target).toBe('/electro/__mvp_not_found__'); expect(p.redirects).not.toMatch(/\/404(?:\.html)?/); expect(p.redirects.match(/__mvp_not_found__/g)).toHaveLength(4);});
 it('guards the complete release contract and collisions',async()=>{
   await expect(assertRetiredRoutes(await fixture())).resolves.toBeUndefined();
   const no404=await fixture('/',undefined,undefined,false); await expect(assertRetiredRoutes(no404)).rejects.toThrow(/404\.html/);
   const changed=await fixture('/', '/uk /other 200\n'); await expect(assertRetiredRoutes(changed)).rejects.toThrow(/exactly/);
   for(const base of ['/','/electro/']) {
     expect(retiredRewrites(base)).toBe(`${base === '/' ? '' : '/electro'}/uk ${base === '/' ? '' : '/electro'}/__mvp_not_found__ 200\n${base === '/' ? '' : '/electro'}/uk/* ${base === '/' ? '' : '/electro'}/__mvp_not_found__ 200\n${base === '/' ? '' : '/electro'}/ru/interactive ${base === '/' ? '' : '/electro'}/__mvp_not_found__ 200\n${base === '/' ? '' : '/electro'}/ru/interactive/* ${base === '/' ? '' : '/electro'}/__mvp_not_found__ 200\n`);
     for(const name of ['__mvp_not_found__','__mvp_not_found__.html']) { const root=await fixture(base,undefined,async r=>writeFile(join(r,name),'collision')); await expect(assertRetiredRoutes(root,base)).rejects.toThrow(/target/); }
     const dirRoot=await fixture(base,undefined,async r=>mkdir(join(r,'__mvp_not_found__'))); await expect(assertRetiredRoutes(dirRoot,base)).rejects.toThrow(/target/);
   }
 });
});
