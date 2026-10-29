import { describe, expect, it } from "vitest";
import { engineeringAxis, niceTicks } from "./scale";
import { chooseEngineeringUnit, formatEngineeringNumber, formatEngineeringValue, inEngineeringUnit } from "./format";
import { nearestSample, plotAxes, validatePlotData, type EngineeringPlotData } from "./plot";
import { firstOrderBode } from "./bode";
import { microModel } from "../showcase/micro-models";
import { microLabs } from "../showcase/micro-catalog";
import { complexPlanePoint, nicePixelsPerUnit } from "./geometry";
import { sampleAtFraction } from "../transient/canvas";

describe("EngineeringAxisScale semantic contracts",()=>{
  it("AXIS-001 nice multiples cover data with a bounded readable tick count",()=>{
    for(const [min,max] of [[0,9.1],[-13,37],[0,.00075],[0,9500]]) {
      const a=engineeringAxis(min,max);expect(a.domain[0]).toBeLessThanOrEqual(min);expect(a.domain[1]).toBeGreaterThanOrEqual(max);
      expect(a.ticks.length).toBeGreaterThanOrEqual(3);expect(a.ticks.length).toBeLessThanOrEqual(10);
      const mantissa=a.step/10**Math.floor(Math.log10(a.step));expect([1,2,2.5,5,10].some(n=>Math.abs(mantissa-n)<1e-10)).toBe(true);
      expect(a.ticks.every(t=>Math.abs(t/a.step-Math.round(t/a.step))<1e-8)).toBe(true);
    }
    expect(niceTicks(0,9.1).some(v=>v===.91)).toBe(false);
  });
  it("AXIS-002 signed and symmetrical axes preserve zero and signs",()=>{
    const a=engineeringAxis(-13,37,{symmetric:true});expect(a.domain[0]).toBe(-a.domain[1]);expect(a.ticks).toContain(0);
    expect(a.position(-13)).toBeLessThan(a.position(0));expect(a.position(37)).toBeGreaterThan(a.position(0));
  });
  it("AXIS-004 constant, subnormal, near-zero and huge domains do not clip or divide by zero",()=>{
    for(const [lo,hi] of [[0,0],[7,7],[-7,-7],[1e-300,8e-300],[Number.MIN_VALUE,2*Number.MIN_VALUE],[-1e308,1e308],[1e300,1.1e300],[1e-15,1e-14]]) {
      const a=engineeringAxis(lo,hi);expect(a.domain.every(Number.isFinite)).toBe(true);expect(a.domain[0]).toBeLessThanOrEqual(lo);expect(a.domain[1]).toBeGreaterThanOrEqual(hi);
      expect(Number.isFinite(a.position(lo))).toBe(true);expect(a.position(lo)).toBeGreaterThanOrEqual(-1e-10);expect(a.position(hi)).toBeLessThanOrEqual(1+1e-10);
      expect(a.ticks.every((v,k)=>!k||v>a.ticks[k-1])).toBe(true);
    }
  });
  it("log axes map equal ratios to equal distances and refuse nonpositive input",()=>{
    const a=engineeringAxis(.1,1000,{logarithmic:true});expect(a.position(10)-a.position(1)).toBeCloseTo(a.position(100)-a.position(10),12);
    expect(a.invert(a.position(7.3))).toBeCloseTo(7.3,10);expect(()=>engineeringAxis(0,10,{logarithmic:true})).toThrow();expect(()=>engineeringAxis(NaN,1)).toThrow();
  });
});
describe("engineering quantities",()=>{
  it("AXIS-003 SI prefixes change display only and retain tiny real values",()=>{
    expect(formatEngineeringValue(.000047,"F","ru")).toBe("47\u00a0мкФ");expect(formatEngineeringValue(1500000,"Hz","uk")).toBe("1,5\u00a0МГц");
    const u=chooseEngineeringUnit("A",.00082,"ru");expect(inEngineeringUnit(.00082,u)).toBeCloseTo(820,10);
    expect(formatEngineeringNumber(3.1e-13,"ru")).not.toBe("0");expect(formatEngineeringNumber(3.1e-13,"ru")).toContain("3,1");
  });
  it("AXIS-005 linked displays keep the same declared choice around a threshold",()=>{
    const previous=chooseEngineeringUnit("Hz",1100,"ru");
    for(const n of [990,1000,1010]){const u=chooseEngineeringUnit("Hz",n,"ru",{previous});expect(u.factor).toBe(previous.factor);expect(u.symbol).toBe("кГц");}
    const milli=chooseEngineeringUnit("mA",.82,"ru",{fixed:true});expect(inEngineeringUnit(.82,milli)).toBeCloseTo(.82,12);
  });
  it("localized presentation leaves machine numbers untouched and suppresses only display negative zero",()=>{
    expect(formatEngineeringNumber(1.9999999997,"ru")).toBe("2");expect(formatEngineeringNumber(-0,"ru")).toBe("0");
    expect(formatEngineeringNumber(1.25,"ru")).toBe("1,25");expect(formatEngineeringNumber(1.25,"uk")).toBe("1,25");expect(formatEngineeringNumber(1.25,"en")).toBe("1.25");
    expect(formatEngineeringNumber(1e-10,"ru",{zeroTolerance:1e-9})).toBe("0");expect(formatEngineeringNumber(NaN,"ru")).toBe("—");
    for(const unit of ["V","A","Ω","F","H","s","Hz","W","var","VA","rad","°","rad/s","rpm","T","Wb","N·m","m"])expect(chooseEngineeringUnit(unit,1,"ru").symbol.length).toBeGreaterThan(0);
  });
});
describe("plot/model consistency",()=>{
  it("PLOT-001/002 invalid labels and nonfinite/log-incompatible samples are rejected",()=>{
    const base:EngineeringPlotData={xLabel:"t, s",yLabel:"U, V",xMax:1,yMin:0,yMax:1,curves:[{label:"U",color:"blue",points:[[0,0],[1,1]]}]};
    expect(validatePlotData(base)).toEqual([]);expect(validatePlotData({...base,xLabel:""})).toContain("missing-axis-label");
    expect(validatePlotData({...base,logarithmic:true})).toContain("invalid-sample");expect(validatePlotData({...base,yMax:Infinity})).toContain("non-finite-domain");
  });
  it("PLOT-003/004/005 autoscaling and cursors retain original computed samples and characteristic coordinates",()=>{
    for(const lab of microLabs){const view=microModel(lab.model,lab.parameters[0].initial,lab.parameters[1].initial,1),before=JSON.stringify(view.plot);
      const axes=plotAxes(view.plot,[view.point,...view.characteristic?[view.characteristic]:[]]);
      for(const c of view.plot.curves)for(const p of c.points){expect(axes.x.position(p[0])).toBeGreaterThanOrEqual(-1e-10);expect(axes.x.position(p[0])).toBeLessThanOrEqual(1+1e-10);expect(axes.y.position(p[1])).toBeGreaterThanOrEqual(-1e-10);expect(axes.y.position(p[1])).toBeLessThanOrEqual(1+1e-10);}
      expect(JSON.stringify(view.plot)).toBe(before);
    }
    const points= microModel("charge",1000,1000,1).plot.curves[0].points;
    const p=nearestSample(points,1)!;expect(p[1]).toBeCloseTo(12*(1-Math.exp(-p[0])),12);expect(points).toContain(p);
  });
  it("BODE / PHYSICS-001 uses the exact RC transfer and continuous one-pole asymptote",()=>{
    // Independent STUD T03 reference: W=1/(1+0.1p), wc=10 rad/s.
    const b=firstOrderBode(.1);expect(b.omegaC).toBe(10);expect(b.exact(10).magnitude).toBeCloseTo(-3.0102999566,9);expect(b.exact(10).phase).toBeCloseTo(-45,12);
    expect(b.asymptote(1)).toBe(0);expect(b.asymptote(10)).toBe(0);expect(b.asymptote(100)).toBeCloseTo(-20,12);
    expect(b.asymptote(10*(1+1e-9))).toBeCloseTo(0,6);expect(b.phase.curves).toHaveLength(1);
    for(const w of [.1,1,10,100,1000]){const re=1/(1+(.1*w)**2),im=-.1*w/(1+(.1*w)**2);expect(10**(b.exact(w).magnitude/20)).toBeCloseTo(Math.hypot(re,im),12);expect(b.exact(w).phase).toBeCloseTo(Math.atan2(im,re)*180/Math.PI,12);}
  });
  it("PHASOR geometry uses equal physical scales, exact endpoints and no fictitious zero phase",()=>{
    const origin={x:250,y:250},scale=nicePixelsPerUnit(230,175);
    for(const [re,im] of [[230,0],[-115,199.18584287042088],[-115,-199.18584287042088]]){
      const p=complexPlanePoint({re,im},origin,scale);expect(Math.hypot(p.x-250,p.y-250)/scale).toBeCloseTo(230,9);expect(Math.atan2(250-p.y,p.x-250)).toBeCloseTo(Math.atan2(im,re),12);
    }
    const a=complexPlanePoint({re:1,im:0},origin,scale),b=complexPlanePoint({re:0,im:1},origin,scale);expect(a.x-250).toBeCloseTo(250-b.y,12);
    expect(complexPlanePoint({re:0,im:0},origin,scale)).toEqual(origin);
  });
  it("PLOT-004 canvas cursor reports the coordinate of the actual solver sample",()=>{
    const n=101,length=100000,domain=120000;
    for(const f of [0,.3333,.5,.73,1]){const s=sampleAtFraction(f,n,length,domain);expect(s.x).toBe(s.index*length/(n-1));expect(s.index).toBeGreaterThanOrEqual(0);expect(s.index).toBeLessThan(n);}
    expect(sampleAtFraction(1,n,length,domain)).toEqual({index:100,x:100000});
  });
});
