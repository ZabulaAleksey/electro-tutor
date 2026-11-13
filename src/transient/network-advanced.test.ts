import {expect,it} from "vitest";
import {at,branchVoltage,DEFAULT_NETWORK,historyValue,lineEnergy,nodePort,simulateNetwork,spatial,type Load,type Network} from "./network";
import {DEFAULT_DIODE,diodeCurrent} from "./line-diode";
import {surfaceFaces} from "./network-surface";
const make=(load:Load):Network=>({...structuredClone(DEFAULT_NETWORK),source:{...DEFAULT_NETWORK.source,resistanceOhm:50},load,durationS:.012});
it("series and parallel RLC agree with independent second-order analytical step solutions",()=>{
 const alpha=1500,w=Math.sqrt(5e6-alpha**2);for(const kind of ["series","parallel"] as const){const r=simulateNetwork(make({id:"load",kind,children:[{id:"R",kind:"r",value:kind==="series"?10:100},{id:"L",kind:"l",value:.02},{id:"C",kind:"c",value:1e-5}]}),{resolution:200});for(const d of [.0003,.001,.002]){const decay=Math.exp(-alpha*d)*Math.sin(w*d),expected=kind==="series"?100-50*100/(.02*w)*decay:2/(1e-5*w)*decay;expect(Math.abs(at(r,1e6,.005+d).u-expected)).toBeLessThan(1.1);}}
});
it("series RC and pure RL retain physical first-order time constants",()=>{
 const rc=simulateNetwork(make({id:"s",kind:"series",children:[{id:"R",kind:"r",value:100},{id:"C",kind:"c",value:1e-5}]}),{resolution:200});const rl=simulateNetwork(make({id:"L",kind:"l",value:.02}),{resolution:200});for(const d of [.0003,.001,.002]){expect(Math.abs(at(rc,1e6,.005+d).u-(100-100/3*Math.exp(-d/.0015)))).toBeLessThan(.7);expect(Math.abs(at(rl,1e6,.005+d).u-100*Math.exp(-d/.0004))).toBeLessThan(1.2);}
});
it("reactive energy includes stored device energy and dissipated load power",()=>{
 const c=make({id:"s",kind:"series",children:[{id:"R",kind:"r",value:100},{id:"C",kind:"c",value:1e-5}]}),r=simulateNetwork(c,{resolution:200});const steps=5000,dt=c.durationS/steps;let input=0,loss=0;for(let k=0;k<steps;k++){const t=(k+.5)*dt,s=nodePort(r,0,t),l=at(r,1e6,t);input+=(100*s.intoLines-50*s.intoLines*s.intoLines)*dt;loss+=l.i*l.i*100*dt;}const stored=lineEnergy(r,c.durationS)+historyValue(r.deviceEnergy,c.durationS,true);expect(Math.abs(input-loss-stored)/input).toBeLessThan(.025);expect(stored).toBeGreaterThan(0);
});
it("3D step faces cover the real x/t domain and have analytical values",()=>{
 const r=simulateNetwork(structuredClone(DEFAULT_NETWORK));for(const q of ["u","i"] as const){const faces=surfaceFaces(r,q)!;expect(faces.length).toBeGreaterThan(2);let area=0;for(const f of faces){const cx=f.xy.reduce((s,p)=>s+p[0],0)/f.xy.length,ct=f.xy.reduce((s,p)=>s+p[1],0)/f.xy.length;expect(f.value).toBeCloseTo(at(r,cx,ct)[q],10);area+=Math.abs(f.xy.reduce((s,p,j)=>{const b=f.xy[(j+1)%f.xy.length];return s+p[0]*b[1]-b[0]*p[1];},0))/2;}expect(area).toBeCloseTo(20000,5);}
});
it("contradictory ideal source/short and unresolved stiff dynamics are refused",()=>{
 const c=make({id:"short",kind:"wire"});c.source.node=1;c.source.resistanceOhm=0;expect(()=>simulateNetwork(c)).toThrow(/inconsistent/);const stiff=make({id:"C",kind:"c",value:1e-9});expect(()=>simulateNetwork(stiff)).toThrow(/resolution-limit/);
});

it("precharged C and L preserve exact initial states and discharge into a matched line",()=>{
 for(const kind of ["c","l"] as const){const c=make({id:"X",kind,value:kind==="c"?1e-5:.02,initial:1});c.source.voltageV=0;const r=simulateNetwork(c,{resolution:200});const initial=at(r,1e6,0);expect(initial.u).toBeCloseTo(kind==="c"?1:-50,7);expect(initial.i).toBeCloseTo(kind==="c"?-.02:1,7);expect(r.deviceEnergy.values[0]).toBeCloseTo(kind==="c"?5e-6:.01,11);for(const t of [.0002,.0007]){const expected=kind==="c"?Math.exp(-t/.0005):-50*Math.exp(-t/.0004);expect(at(r,1e6,t).u).toBeCloseTo(expected,kind==="c"?3:1);}}
});
it("initial capacitor voltages and inductor currents must satisfy circuit constraints",()=>{
 const base=make({id:"P",kind:"parallel",children:[{id:"a",kind:"c",value:1e-5,initial:1},{id:"b",kind:"c",value:2e-5,initial:2}]});expect(()=>simulateNetwork(base)).toThrow(/initial/);base.load={id:"S",kind:"series",children:[{id:"a",kind:"l",value:.01,initial:1},{id:"b",kind:"l",value:.02,initial:2}]};expect(()=>simulateNetwork(base)).toThrow(/initial/);base.load.children![1].initial=1;const valid=simulateNetwork(base);expect(at(valid,1e6,0).i).toBeCloseTo(1,6);
});
it("import bounds and wave budgets refuse oversized geometry and histories",()=>{
 const bad=make({id:"R",kind:"r",value:100});bad.sections[0].lengthM=1e308;expect(()=>simulateNetwork(bad)).toThrow(/line/);bad.sections[0].lengthM=1e6;(bad as unknown as {shunts?:unknown}).shunts=undefined;expect(()=>simulateNetwork(bad)).toThrow(/shunts/);const many=make({id:"R",kind:"r",value:80});many.durationS=.1;many.source.resistanceOhm=0;many.load={id:"load",kind:"open"};many.sections=Array.from({length:3},(_,j)=>({id:`TL${j}`,lengthM:100,velocityMS:2e8,impedanceOhm:j%2?1e6:.001}));expect(()=>simulateNetwork(many)).toThrow(/budget|limit/);
});

it("directional current components use the local impedance on both sides of a junction",()=>{
 const c=make({id:"R",kind:"r",value:100});c.sections.push({...c.sections[0],id:"TL2",impedanceOhm:100});const r=simulateNetwork(c);const forward=spatial(r,.007,"forwardI"),backward=spatial(r,.007,"backwardI"),sum=spatial(r,.007,"i");for(let j=0;j<sum.length;j++)expect(forward[j][1]+backward[j][1]).toBeCloseTo(sum[j][1],10);
});

it("event overrides share passive component bounds",()=>{for(const value of [5e-324,1e308]){const c=make({id:"R",kind:"r",value:50});c.events=[{id:"e",atS:.008,target:"R",kind:"resistance",value}];expect(()=>simulateNetwork(c)).toThrow(/event/);}});

it("front endpoint values are right-continuous at launch and reflection",()=>{const r=simulateNetwork(structuredClone(DEFAULT_NETWORK));const launch=spatial(r,0,"u"),arrival=spatial(r,.005,"u");expect(launch[0]).toEqual([0,100]);expect(launch.at(-1)).toEqual([1e6,0]);expect(arrival.at(-1)).toEqual([1e6,200]);});

function matchedChain(){
 const model=make({id:"load",kind:"r",value:50});
 model.sections.push({...model.sections[0],id:"TL2"});
 return model;
}

it("intermediate L and C obey the analytical shunt transients and junction current balance",()=>{
 for(const kind of ["l","c"] as const){
  const model=matchedChain(),value=kind==="l"?.02:1e-5;
  const branch={id:"device",from:1,to:"reference" as const,component:{kind,value}};
  model.branches=[branch];
  const run=simulateNetwork(model,{resolution:250});
  expect(run.method).toBe("characteristics-trapezoid");
  for(const delay of [.0002,.0005,.001]){
   const time=.005+delay,expected=kind==="l"?50*Math.exp(-delay*25/value):50*(-Math.expm1(-delay/(25*value)));
   const voltage=branchVoltage(run,branch,time),current=-nodePort(run,1,time).intoLines;
   expect(Math.abs(voltage-expected)).toBeLessThan(1);
   expect(Math.abs(current-(50-expected)/25)).toBeLessThan(.04);
   expect(historyValue(run.deviceEnergy,time,true)).toBeGreaterThan(0);
  }
 }
});

it("a series diode and an intermediate diode share the actual nodal current balance",()=>{
 const model=matchedChain();
 const series={id:"VD1",from:1,to:3,component:{kind:"diode" as const,diode:DEFAULT_DIODE}};
 const branch={id:"VD2",from:1,to:"reference" as const,component:{kind:"diode" as const,diode:{...DEFAULT_DIODE,ideality:2}}};
 model.series=[series];model.branches=[branch];
 const run=simulateNetwork(model),time=.006;
 const before=nodePort(run,1,time),after=nodePort(run,3,time);
 const through=diodeCurrent(branchVoltage(run,series,time),DEFAULT_DIODE);
 const shunt=diodeCurrent(branchVoltage(run,branch,time),branch.component.diode);
 expect(through).toBeGreaterThan(0);
 expect(shunt).toBeGreaterThan(0);
 expect(through).toBeCloseTo(after.intoLines,6);
 expect(before.intoLines+through+shunt).toBeCloseTo(0,6);
});

it("a diode between signal nodes charges an intermediate capacitor and satisfies KCL",()=>{
 const model=matchedChain();
 const diode={id:"VD",from:0,to:1,component:{kind:"diode" as const,diode:DEFAULT_DIODE}};
 const capacitor={id:"C",from:1,to:"reference" as const,component:{kind:"c" as const,value:1e-5}};
 model.branches=[diode,capacitor];
 const run=simulateNetwork(model);
 const time=.003,voltage=branchVoltage(run,capacitor,time);
 const diodeI=diodeCurrent(branchVoltage(run,diode,time),DEFAULT_DIODE);
 const h=run.stepS;
 const capacitorI=capacitor.component.value*(branchVoltage(run,capacitor,time+h)-branchVoltage(run,capacitor,time-h))/(2*h);
 expect(voltage).toBeGreaterThan(10);
 expect(diodeI).toBeGreaterThan(0);
 expect(diodeI-nodePort(run,1,time).intoLines-capacitorI).toBeCloseTo(0,2);
});

it("series L and C use the voltage difference between the two sides of a split joint",()=>{
 for(const kind of ["l","c"] as const){
  const model=matchedChain(),value=kind==="l"?.02:1e-5;
  const series={id:"X",from:1,to:3,component:{kind,value}};
  model.series=[series];
  const run=simulateNetwork(model,{resolution:250});
  for(const delay of [.0002,.0005,.001]){
   const time=.005+delay,decay=Math.exp(-delay/(kind==="l"?value/100:100*value));
   const expectedCurrent=(kind==="l"?1-decay:decay);
   expect(Math.abs(nodePort(run,3,time).intoLines-expectedCurrent)).toBeLessThan(.025);
   expect(Math.abs(branchVoltage(run,series,time)-100*(1-expectedCurrent))).toBeLessThan(2.5);
  }
 }
});

it("rejects a capacitor directly across an ideal stepped voltage source",()=>{
 const model=matchedChain();
 model.source.resistanceOhm=0;
 model.branches=[{id:"C",from:0,to:"reference",component:{kind:"c",value:1e-5}}];
 expect(()=>simulateNetwork(model)).toThrow("ideal-source-at-reactive-branch");
});
