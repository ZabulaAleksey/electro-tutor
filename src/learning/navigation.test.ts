import {describe,it,expect} from 'vitest';
import {curriculum} from '../curriculum';
import {catalogueItems} from '../catalogue/catalog';
import {buildLearningNavigation,chooseLearningTarget} from './navigation';
const published=[{language:'ru' as const,section:'dc',slug:'mesh-current-method'},{language:'uk' as const,section:'dc',slug:'mesh-current-method'}];
describe('RUN6 derived learning index',()=>{
  it('derives the existing20topics and31tools with unique stable IDs, no duplicated catalogue',()=>{
    const groups=buildLearningNavigation(published,'ru'),entries=groups.flatMap(g=>g.entries);
    expect(entries.filter(e=>e.kind==='topic')).toHaveLength(curriculum.flatMap(s=>s.topics).length);
    expect(entries.filter(e=>e.kind==='tool')).toHaveLength(catalogueItems.length);
    expect(new Set(entries.map(e=>e.id)).size).toBe(entries.length);
    for(const item of catalogueItems)expect(entries.find(e=>e.id==='tool:'+item.id)?.title).toEqual(item.title);
  });
  it('uses actual publications and does not invent19textbook URLs',()=>{
    const topics=buildLearningNavigation(published,'ru').flatMap(g=>g.entries).filter(e=>e.kind==='topic');
    expect(topics.filter(e=>e.components.textbook.href)).toHaveLength(1);
    expect(buildLearningNavigation([],'ru').flatMap(g=>g.entries).every(e=>!e.components.textbook.href)).toBe(true);
    const mesh=topics.find(e=>e.id==='topic:dc/mesh')!;
    expect(mesh.components.examples.href).toBe('/ru/topics/dc/mesh-current-method/examples/');
    expect(mesh.components.lab.href).toBe('/ru/topics/dc/mesh-current-method/lab/');
    expect(topics.find(e=>e.id==='topic:magnetic/nonlinear-magnetic')?.components.lab.href).toBeNull();
  });
  it('allows a direct existing lab when no textbook/examples exist, explicitly reports fallback',()=>{
    const entries=buildLearningNavigation(published,'ru').flatMap(g=>g.entries),fourier=entries.find(e=>e.id==='tool:advanced:fourier')!;
    expect(chooseLearningTarget(fourier,'examples')).toEqual({href:'/ru/interactive/fourier/',stage:'lab',fallback:true});
    expect(chooseLearningTarget(fourier,'lab')?.fallback).toBe(false);
    expect(chooseLearningTarget(entries.find(e=>e.id==='topic:magnetic/nonlinear-magnetic')!,'textbook')).toBeNull();
    expect(entries.find(e=>e.id==='tool:advanced:transmission-line')?.variants[0].href).toBe('/ru/interactive/transmission-line-reference/');
  });
  it('keeps Ukrainian textbook and full tools without inventing untranslated mesh stages',()=>{
    const entries=buildLearningNavigation(published,'uk').flatMap(g=>g.entries),mesh=entries.find(e=>e.id==='topic:dc/mesh')!;
    expect(mesh.components.textbook.href).toBe('/uk/topics/dc/mesh-current-method/');
    expect(mesh.components.examples).toMatchObject({href:null,status:'not-translated'});
    expect(mesh.components.lab).toMatchObject({href:null,status:'not-translated'});
    expect(entries.filter(e=>e.kind==='tool'&&e.components.lab.href?.startsWith('/uk/'))).toHaveLength(31);
  });
  it('filters public before render/serialization and preserves exact three mesh components',()=>{
    const groups=buildLearningNavigation(published,'ru',true),entries=groups.flatMap(g=>g.entries);expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('topic:dc/mesh');expect(Object.values(entries[0].components).every(c=>c.href&&c.modes.public)).toBe(true);
    expect(JSON.stringify(groups)).not.toMatch(/\/uk\/|\/interactive\/|\/micro-labs\/|\/classroom\//);
    expect(buildLearningNavigation(published,'uk',true)).toEqual([]);
  });
  it('uses the same base for components, related tools and variants',()=>{
    const entries=buildLearningNavigation(published,'ru',false,'/electro-tutor/').flatMap(g=>g.entries);
    for(const e of entries){for(const c of Object.values(e.components))if(c.href)expect(c.href.startsWith('/electro-tutor/ru/')).toBe(true);for(const r of[...e.relatedTools,...e.variants])expect(r.href.startsWith('/electro-tutor/ru/')).toBe(true);}
    expect(buildLearningNavigation(published,'ru',true,'/electro-tutor/').flatMap(g=>g.entries)).toHaveLength(1);
  });
});
