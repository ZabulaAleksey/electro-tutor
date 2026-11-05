import {describe,it,expect} from 'vitest';
import {meshJourneyHref,isCurrentLink,requestedStage} from './browser-contents';
const book='/electro-tutor/ru/topics/dc/mesh-current-method/';
describe('shared mesh journey URL context',()=>{
 it('carries all four legitimate example fragments to the current lab without reset',()=>{
  for(const id of [1,2,3,4])expect(meshJourneyHref(book+'lab/?learningStage=lab',2,new URL('https://local'+book+'examples/#example-'+id))).toBe(book+'lab/?example='+id);
 });
 it('returns to the matching example and preserves base path',()=>{
  expect(meshJourneyHref(book+'examples/?learningStage=examples',1,new URL('https://local'+book+'lab/?example=4&reset=1'))).toBe(book+'examples/#example-4');
 });
 it('does not carry unsafe/malformed example values or reset to other stages',()=>{
  expect(meshJourneyHref(book+'lab/',2,new URL('https://local'+book+'examples/?example=%3Cscript%3E#example-9'))).toBe(book+'lab/?example=1');
  expect(meshJourneyHref(book,0,new URL('https://local'+book+'lab/?example=4&reset=1'))).toBe(book);
 });
});

it('keeps current component under experiment queries and distinguishes tool selectors',()=>{
 expect(isCurrentLink('/ru/interactive/fourier/',new URL('https://local/ru/interactive/fourier/?harmonics=4'))).toBe(true);
 expect(isCurrentLink('/ru/micro-labs/#micro=a',new URL('https://local/ru/micro-labs/?R=4#micro=a'))).toBe(true);
 expect(isCurrentLink('/ru/micro-labs/#micro=a',new URL('https://local/ru/micro-labs/#micro=b'))).toBe(false);
 expect(isCurrentLink('https://other/ru/interactive/fourier/',new URL('https://local/ru/interactive/fourier/'))).toBe(false);
});
it('infers direct lab stage from filtered rendered component links without private path constants',()=>{
 const components=[{stage:'lab' as const,href:'/ru/interactive/fourier/'}];
 expect(requestedStage(new URL('https://local/ru/interactive/fourier/?harmonics=4'),components)).toBe('lab');
 expect(requestedStage(new URL('https://local/ru/interactive/fourier/?learningStage=examples'),components)).toBe('examples');
 expect(requestedStage(new URL('https://local/ru/interactive/fourier/?learningStage=textbook'),components)).toBe('textbook');
});
