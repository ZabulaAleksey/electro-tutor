import {expect,it} from "vitest";
import {at,DEFAULT_NETWORK,estimateNetwork,simulateNetwork,timeTrace} from "./network";

it.each([.001,.01,.1,1,10])("preserves pulse peak, delay and open reflection at duration %s",durationS=>{
 const config=structuredClone(DEFAULT_NETWORK);
 config.sections[0].lengthM=2e4;
 config.source.resistanceOhm=50;
 config.source.offS=.00003;
 config.durationS=durationS;
 const run=simulateNetwork(config);
 expect(at(run,20000,.00009).u).toBe(0);
 expect(at(run,20000,.00011).u).toBeCloseTo(100,10);
 expect(at(run,20000,.00015).u).toBe(0);
 expect(timeTrace(run,20000).some(([,u])=>u===100)).toBe(true);
 expect(at(run,20000,durationS).u).toBe(0);
});
it("resolves a reactive boundary over one second and converges with refinement",()=>{
 const config=structuredClone(DEFAULT_NETWORK);
 config.source.resistanceOhm=50;
 config.load={id:"C",kind:"c",value:1e-5};
 config.durationS=1;
 const estimate=estimateNetwork(config);
 expect(estimate?.kind).toBe("numeric");
 const first=simulateNetwork(config),fine=simulateNetwork(config,{resolution:400});
 const expected=100*(1-Math.exp(-.0004/.0005));
 const sample=.0054;
 expect(fine.stepS).toBeLessThan(first.stepS);
 expect(Math.abs(at(fine,1e6,sample).u-expected)).toBeLessThan(Math.abs(at(first,1e6,sample).u-expected));
 expect(Math.abs(at(fine,1e6,sample).u-expected)).toBeLessThan(1.2);
 expect(at(first,1e6,1).u).toBeCloseTo(100,5);
 expect(timeTrace(first,1e6).length).toBeLessThanOrEqual(2402);
 const zoom=timeTrace(first,1e6,"u",.005,.006);
 expect(zoom[0][0]).toBe(.005);
 expect(zoom.at(-1)?.[0]).toBe(.006);
});
it("retains thousands of exact reflections independently of the graph budget",()=>{
 const config=structuredClone(DEFAULT_NETWORK);
 config.sections[0].lengthM=2e4;
 config.durationS=1;
 const run=simulateNetwork(config);
 expect(run.ports[0].values.length+run.ports[1].values.length).toBeGreaterThan(2400);
 const trace=timeTrace(run,1e4);
 expect(trace.length).toBeLessThanOrEqual(2402);
 expect(Math.max(...trace.map(point=>point[1]))).toBe(200);
 expect(at(run,1e4,.999).u).toBeCloseTo(200,10);
 expect(at(run,1e4,.9992).u).toBeCloseTo(0,10);
});
