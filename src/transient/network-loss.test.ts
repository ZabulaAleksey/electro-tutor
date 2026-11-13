import {expect,it} from "vitest";
import {at,DEFAULT_NETWORK,distributedParameters,lineEnergy,nodePort,simulateNetwork,spatial,type Network} from "./network";

function sample():Network{
 const c=structuredClone(DEFAULT_NETWORK);
 c.source.resistanceOhm=50;
 c.load={id:"load",kind:"r",value:50};
 c.sections[0].resistanceOhmM=50*Math.log(2)/1e6;
 return c;
}
it("matches analytical attenuation, delay and stored energy in a matched line",()=>{
 const c=sample(),run=simulateNetwork(c);
 expect(at(run,1e6,.0049).u).toBe(0);
 expect(at(run,5e5,.006).u).toBeCloseTo(50/Math.sqrt(2),10);
 expect(at(run,1e6,.006).i).toBeCloseTo(.5,10);
 expect(nodePort(run,1,.006).u).toBeCloseTo(25,10);
 const p=distributedParameters(c.sections[0]);
 expect(p.r/p.l).toBeCloseTo(p.g/p.c,12);
 expect(spatial(run,.006,"u").some(([x,u])=>x===5e5&&Math.abs(u-50/Math.sqrt(2))<1e-10)).toBe(true);
 expect(lineEnergy(run,.006)).toBeCloseTo(2500/(50*2e8)*1e6*.75/(2*Math.log(2)),10);
});
it("attenuates open-end reflections and multiplies distinct section losses",()=>{
 const c=sample();
 c.load={id:"load",kind:"open"};
 const run=simulateNetwork(c);
 expect(at(run,1e6,.006).u).toBeCloseTo(50,10);
 expect(at(run,0,.011).backward).toBeCloseTo(12.5,10);
 c.load={id:"load",kind:"r",value:50};
 c.sections.push({...c.sections[0],id:"TL2",resistanceOhmM:50*Math.log(4)/1e6});
 expect(nodePort(simulateNetwork(c),2,.012).u).toBeCloseTo(6.25,10);
});
it("passes attenuated incident voltage into the reactive boundary solve",()=>{
 const c=sample();
 c.load={id:"C",kind:"c",value:1e-5};
 const run=simulateNetwork(c,{resolution:250});
 const delay=.001;
 expect(Math.abs(at(run,1e6,.005+delay).u-50*(1-Math.exp(-delay/.0005)))).toBeLessThan(.6);
});
