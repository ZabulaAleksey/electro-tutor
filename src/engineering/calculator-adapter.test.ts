import {it,expect} from "vitest";
import {calculateSeries,calculateRc} from "../components/EngineeringCalculatorModel";
it("calculator reuses series Kirchhoff and RC initial/asymptotic values",()=>{const d=calculateSeries(12,10,20);expect(d.current).toBeCloseTo(.4,12);expect(d.u1+d.u2).toBeCloseTo(12,12);expect(calculateRc(10,1000,.0001,0).value).toBe(0);expect(calculateRc(10,1000,.0001,.1).value).toBeCloseTo(10*(1-Math.exp(-1)),12);});
it("calculator refuses invalid input instead of substituting a fake nominal",()=>{expect(()=>calculateSeries(12,-1,20)).toThrow();expect(()=>calculateRc(10,0,1,1)).toThrow();expect(()=>calculateRc(10,1,NaN,1)).toThrow();});
