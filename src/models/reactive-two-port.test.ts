import {expect,it} from "vitest";
import {fractionText,limits,reactance,readCircuit,resonances,solveCircuit,type Circuit} from "./reactive-two-port";

const l=(value=20):Circuit=>({kind:"l",value});
const c=(value=50):Circuit=>({kind:"c",value});
const pair=(kind:"series"|"parallel",left=l(),right=c()):Circuit=>({kind,left,right});
const z=(circuit:Circuit)=>solveCircuit(circuit).impedance;

it("matches the single-element, series and parallel LC closed forms",()=>{
 expect(reactance(z(l()),2000)).toBeCloseTo(40,12);
 expect(reactance(z(c()),2000)).toBeCloseTo(-10,12);
 expect(limits(z(l()))).toEqual({dc:"zero",high:"pole"});
 expect(limits(z(c()))).toEqual({dc:"pole",high:"zero"});
 expect(reactance(z(pair("series")),2000)).toBeCloseTo(30,12);
 expect(reactance(z(pair("parallel")),2000)).toBeCloseTo(-40/3,12);
 expect(resonances(z(pair("series")))).toEqual([{kind:"zero",omega:1000}]);
 expect(resonances(z(pair("parallel")))).toEqual([{kind:"pole",omega:1000}]);
});

it("cancels common factors for identical and proportionate branches exactly",()=>{
 const a=pair("series"), b=pair("series",l(40),c(25));
 const identical=z(pair("parallel",a,a));
 expect(fractionText(identical)).toBe("(10q^2 + 10) / (q)");
 const equivalent=z(pair("parallel",a,b));
 expect(resonances(equivalent)).toEqual([{kind:"zero",omega:1000}]);
 expect(reactance(equivalent,2000)).toBeCloseTo(20,12);
 const duplicatedPole=z(pair("series",pair("parallel"),pair("parallel",l(40),c(25))));
 expect(resonances(duplicatedPole)).toEqual([{kind:"pole",omega:1000}]);
});

it("keeps two close zero frequencies and the intervening pole",()=>{
 const result=resonances(z(pair("parallel",pair("series"),pair("series",l(20.001),c()))));
 expect(result.map(r=>r.kind)).toEqual(["zero","pole","zero"]);
 expect(result[0].omega).toBeCloseTo(1000*Math.sqrt(20/20.001),8);
 expect(result[2].omega).toBeCloseTo(1000,8);
});

it("agrees with an independent pointwise solver for every intermediate nested step",()=>{
 const circuit=pair("parallel",pair("series",l(77),pair("parallel",l(9),c(33))),
  pair("series",c(17),l(13)));
 function direct(node:Circuit,w:number):number{
  if(node.kind==="l")return w*node.value*.001;
  if(node.kind==="c")return -1/(w*node.value*1e-6);
  if("left" in node){
   const a=direct(node.left,w),b=direct(node.right,w);
   return node.kind==="series"?a+b:1/(1/a+1/b);
  }
  throw Error("unexpected component");
 }
 const {impedance,steps}=solveCircuit(circuit);
 expect(steps).toHaveLength(4);
 for(const w of [28,296,713,2940,25000]){
  expect(reactance(impedance,w)).toBeCloseTo(direct(circuit,w),9);
  for(const step of steps)expect(reactance(step.impedance,w)).toBeCloseTo(direct(step.circuit,w),9);
 }
});

it("rejects missing or invalid topology, fractional ticks and excessive size",()=>{
 expect(readCircuit(pair("series"))).toEqual(pair("series"));
 for(const v of [0,-2,NaN,Infinity,.0001,100001,1.0001])expect(readCircuit(l(v))).toBeNull();
 expect(readCircuit({kind:"series",left:l()})).toBeNull();
 const four=pair("series",pair("series"),pair("parallel"));
 expect(readCircuit(pair("parallel",four,four))).not.toBeNull();
 expect(readCircuit(pair("parallel",pair("series",four,four),l()))).toBeNull();
});
