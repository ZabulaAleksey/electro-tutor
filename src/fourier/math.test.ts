import { describe, expect, it } from "vitest";
import { dft, epicycleChain, normalizeContour, reconstruct, reconstructionError, resampleContour } from "./math";
import { dctII, haarBasis, projectBasis, reconstructBasis, walsh } from "./bases";
describe("Fourier engineering math",()=>{
 it("round-trips a constant",()=>{const s=Array.from({length:8},()=>({re:2,im:-1}));const c=dft(s);expect(c[0].re).toBeCloseTo(2);expect(c[0].im).toBeCloseTo(-1);expect(reconstruct(c,0.37)).toEqual(expect.objectContaining({re:expect.closeTo(2,8),im:expect.closeTo(-1,8)}));});
 it("preserves a signed negative frequency",()=>{const s=Array.from({length:16},(_,n)=>({re:Math.cos(-2*Math.PI*3*n/16),im:Math.sin(-2*Math.PI*3*n/16)}));const c=dft(s);expect(c.find(x=>x.k===-3)?.amplitude).toBeCloseTo(1,5);});
 it("uses one endpoint for chain and reconstruction",()=>{const s=Array.from({length:16},(_,n)=>({re:Math.cos(2*Math.PI*n/16),im:Math.sin(2*Math.PI*n/16)}));const c=dft(s);const chain=epicycleChain(c,.23);const q=reconstruct(c,.23);expect(chain.at(-1)!.end.re).toBeCloseTo(q.re,10);expect(chain.at(-1)!.end.im).toBeCloseTo(q.im,10);});
 it("normalizes and reports bounded truncation error",()=>{const s=normalizeContour([{re:0,im:0},{re:2,im:0},{re:2,im:2},{re:0,im:2}],32);const e=reconstructionError(s,dft(s).slice(0,4));expect(s).toHaveLength(32);expect(e.rms).toBeLessThan(1);});
 it("resamples a closed rectangle around its perimeter",()=>{const s=normalizeContour([{re:0,im:0},{re:4,im:0},{re:4,im:1},{re:0,im:1}],40);expect(s).toHaveLength(40);expect(new Set(s.map(p=>`${p.re.toFixed(3)},${p.im.toFixed(3)}`)).size).toBeGreaterThan(10);});
 it("handles empty input without NaN",()=>{expect(dft([])).toEqual([]);expect(normalizeContour([])).toEqual([]);});
 it("filters malformed and adjacent duplicate points before resampling",()=>{const s=resampleContour([{re:0,im:0},{re:0,im:0},{re:Number.NaN,im:2},{re:1,im:0},{re:1,im:0},{re:0,im:0}],16,true);expect(s).toHaveLength(16);expect(s.every(p=>Number.isFinite(p.re)&&Number.isFinite(p.im))).toBe(true);});
 it("round-trips a unit circle with the full inverse",()=>{const s=Array.from({length:32},(_,n)=>({re:Math.cos(2*Math.PI*n/32),im:Math.sin(2*Math.PI*n/32)}));const c=dft(s);const e=reconstructionError(s,c);expect(e.rms).toBeLessThan(1e-10);expect(e.max).toBeLessThan(1e-9);});
});
describe("Fourier alternative bases",()=>{
 it.each(["haar","dct","walsh"] as const)("reconstructs a known signal in %s",(basis)=>{const values=[1,2,3,4,3,2,1,0];const coefficients=projectBasis(values,basis);const restored=reconstructBasis(coefficients,basis);expect(restored).toHaveLength(values.length);restored.forEach((v,i)=>expect(v).toBeCloseTo(values[i],8));});
 it("keeps the basis rows orthonormal",()=>{const rows=haarBasis(8);for(let i=0;i<rows.length;i++)for(let j=0;j<rows.length;j++){const dot=rows[i].reduce((s,x,k)=>s+x*rows[j][k],0);expect(dot).toBeCloseTo(i===j?1:0,8);}});
 it("uses power-of-two Walsh examples and DCT DC correctly",()=>{expect(walsh([1,1,1,1])[0]).toBeCloseTo(2);expect(dctII([2,2,2,2])[0]).toBeCloseTo(4);});
 it("matches independent constant-signal coefficients in every real basis",()=>{const values=Array(8).fill(1);for(const basis of ["haar","dct","walsh"] as const){const coefficients=projectBasis(values,basis);expect(coefficients[0]).toBeCloseTo(Math.sqrt(8),8);expect(Math.max(...coefficients.slice(1).map(Math.abs))).toBeLessThan(1e-10);}});
});
