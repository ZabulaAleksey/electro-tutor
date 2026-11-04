import {describe,it,expect} from 'vitest';
import {isPublicPage,mvpMode,publicRoutes,mvpManifest} from '../../scripts/public-mvp-contract.mjs';
import {parseLabContext} from '../mesh/lab-context';
import {makeDraft} from '../mesh/presentation';
import {meshPreset} from '../models/mesh-current';
describe('MVP build boundary',()=>{
 it('fails closed for malformed flags and never accepts runtime truthy text',()=>{expect(mvpMode(undefined)).toBe(false);expect(mvpMode(undefined,true)).toBe(true);expect(mvpMode('false',true)).toBe(false);expect(mvpMode('true')).toBe(true);for(const s of ['1','yes','TRUE'])expect(()=>mvpMode(s)).toThrow();});
 it('allows seven content routes only, with explicit base and no catalogue/query bypass',()=>{expect(publicRoutes).toHaveLength(7);for(const p of publicRoutes)expect(isPublicPage('/et'+p,'/et/')).toBe(true);for(const p of ['/uk/','/ru/topics/','/ru/interactive/','/ru/topics/ac/ohm/','/ru/?PUBLIC_MVP_MODE=false','/et//ru/'])expect(isPublicPage(p,'/et/')).toBe(false);});
 it('manifest shortcuts and icons stay under base',()=>{const m=mvpManifest('/et/');expect(m.lang).toBe('ru');expect(m.start_url).toBe('/et/ru/');expect(m.shortcuts).toHaveLength(3);expect(m.shortcuts.every(s=>isPublicPage(s.url,'/et/'))).toBe(true);expect(m.icons.every(i=>i.src.startsWith('/et/icons/'))).toBe(true);});
});
describe('Optional lab context is UI data only',()=>{
 const sample={version:1,example:4,draft:makeDraft(meshPreset(4)),active:'J',loop:2};
 it('retains edited and invalid raw values without changing solver validation',()=>{const value={...sample,draft:{...sample.draft,J:'-1,25',R1:''}};expect(parseLabContext(JSON.stringify(value))).toEqual(value);});
 it('rejects corrupt, oversized, unknown, incomplete and incompatible state',()=>{for(const v of [null,'{','x'.repeat(4097),JSON.stringify({...sample,example:5}),JSON.stringify({...sample,version:2}),JSON.stringify({...sample,active:'__proto__'}),JSON.stringify({...sample,loop:3}),JSON.stringify({...sample,draft:{...sample.draft,J:'x'.repeat(33)}}),JSON.stringify({...sample,draft:{R1:'1'}})])expect(parseLabContext(v)).toBeNull();});
 it('copies only known fields and exact own parameter keys',()=>{expect(parseLabContext(JSON.stringify({...sample,secret:'ignored'}))).toEqual(sample);expect(parseLabContext(JSON.stringify({...sample,draft:{...sample.draft,unexpected:'x'}}))).toBeNull();});
});
