import {expect,it} from "vitest";
import {fitBasis,parseBasis} from "./custom-basis";
const samples=Array.from({length:65},(_,i)=>{
 const x=-1+i/32;
 return {re:3+2*x+x*x,im:2-5*x};
});
it("reconstructs a complex target in a nonorthogonal basis with either weighting and normalization",()=>{
 const basis=parseBasis("1\n1+x\nx^2")!;
 for(const weight of [true,false])for(const normalize of [true,false]){
  const fit=fitBasis(samples,basis,[-1,1],weight,normalize)!;
  expect(fit.orthogonal).toBe(false);
  expect(fit.condition).toBeGreaterThan(1);
  expect(fit.rms).toBeLessThan(1e-12);
 }
});
it("rejects dependent and invalid functions and recognizes orthogonality",()=>{
 expect(fitBasis(samples,parseBasis("x\n2*x")!,[-1,1],true,true)).toBeNull();
 expect(fitBasis(samples,parseBasis("1\nx")!,[-1,1],true,true)?.orthogonal).toBe(true);
 expect(parseBasis("window.alert(1)")).toBeNull();
 expect(parseBasis("1++x")).toBeNull();
 expect(parseBasis("cos(2*x)+step(0.5)")?.[0](1)).toBeCloseTo(Math.cos(2)+1,12);
});
