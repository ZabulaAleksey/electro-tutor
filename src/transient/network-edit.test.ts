import { DEFAULT_DIODE, diodeCurrent } from "./line-diode";
import { describe, expect, it } from "vitest";
import { DEFAULT_NETWORK, MAX_SECTIONS, at, simulateNetwork, validateNetwork } from "./network";
import { appendSection, placementTargets, removeSection } from "./network-edit";

describe("visual network operations", () => {
  it("splits a section without moving existing connections or changing total delay", () => {
    const model = { ...DEFAULT_NETWORK, source: { ...DEFAULT_NETWORK.source, node: 1 }, shunts: [{ node: 1, resistanceOhm: 75 }] };
    const targets = placementTargets(model, "shunt");
    expect(targets.find(p => p.kind === "node" && p.index === 1)?.edit).toBeNull();
    const next = targets.find(p => p.kind === "span")!.edit!.model;
    expect(next.sections.map(s => [s.lengthM, s.impedanceOhm, s.velocityMS])).toEqual([[500000, 50, 2e8], [500000, 50, 2e8]]);
    expect(next.source.node).toBe(2);
    expect(next.shunts).toEqual([{ node: 2, resistanceOhm: 75 }, { node: 1, resistanceOhm: 100 }]);
    expect(validateNetwork(next)).toEqual([]);
  });

  it("uses the last section impedance for matched termination and calculates the transmitted step", () => {
    const model = appendSection(DEFAULT_NETWORK).model;
    model.sections[1] = { ...model.sections[1], impedanceOhm: 70 };
    const targets = placementTargets(model, "matched");
    expect(targets.filter(p => p.edit).map(p => p.kind)).toEqual(["end"]);
    const next = targets.find(p => p.edit)!.edit!.model;
    expect(next.load).toMatchObject({ kind: "r", value: 70 });
    expect(at(simulateNetwork(next), 2e6, .011).u).toBeCloseTo(100 * 140 / 120);
  });

  it("rejects terminal shorts at an energized ideal source and observes the solver section limit", () => {
    const model = { ...DEFAULT_NETWORK, source: { ...DEFAULT_NETWORK.source, node: 1 } };
    expect(placementTargets(model, "wire").at(-1)).toMatchObject({ edit: null, error: "inconsistent-ideal-source-and-short" });
    let full = model;
    while (full.sections.length < MAX_SECTIONS) full = appendSection(full).model;
    expect(placementTargets(full, "line").at(-1)).toMatchObject({ edit: null, error: "section-limit" });
    expect(placementTargets(full, "shunt").find(p => p.kind === "span")).toMatchObject({ edit: null, error: "section-limit" });
  });

  it("preserves existing attachments on removal and refuses to merge two shunts", () => {
    const model = appendSection(DEFAULT_NETWORK).model;
    model.source = { ...model.source, node: 1 };
    model.shunts = [{ node: 0, resistanceOhm: 20 }, { node: 1, resistanceOhm: 30 }];
    expect(removeSection(model, 0)).toEqual({ error: "merge-shunts" });
    model.shunts = model.shunts.slice(1);
    expect(removeSection(model, 0)).toMatchObject({ confirm: true, model: { source: { node: 0 }, shunts: [{ node: 0, resistanceOhm: 30 }] } });
  });
});


describe("resistive contacts and switching", () => {
  const base=()=>({...appendSection(DEFAULT_NETWORK).model,
    source:{...DEFAULT_NETWORK.source,resistanceOhm:50},
    load:{id:"load",kind:"r" as const,value:50}});
  it("preserves section parameters when inserting R inside the line and scatters at the two-terminal joint",()=>{
    const selected=placementTargets({...DEFAULT_NETWORK,source:{...DEFAULT_NETWORK.source,resistanceOhm:50}},"r")
      .find(target=>target.kind==="span")!.edit!.model;
    expect(selected.sections.map(s=>s.lengthM)).toEqual([5e5,5e5]);
    expect(selected.series).toMatchObject([{from:1,to:3,resistanceOhm:100}]);
    const run=simulateNetwork({...selected,load:{id:"load",kind:"r",value:50}});
    expect(at(run,500000,.003).u).toBeCloseTo(75);
    expect(at(run,500001,.003).u).toBeCloseTo(25);
    expect(at(run,500001,.003).i).toBeCloseTo(.5);
    expect(at(run,1e6,.006).u).toBeCloseTo(25);
  });
  it("closes an open series key at the scheduled time without changing earlier waves",()=>{
    const model={...base(),series:[{id:"K1",from:1,to:3,switch:{closed:false,atS:.006,closes:true}}]};
    const run=simulateNetwork(model);
    expect(run.events).toContain(.006);
    expect(at(run,1e6,.0055)).toMatchObject({u:100,i:0});
    expect(at(run,1e6+1,.0061).u).toBeCloseTo(50);
    expect(at(run,2e6,.0105).u).toBeCloseTo(0);
    expect(at(run,2e6,.0115).u).toBeCloseTo(50);
  });
  it("uses a bridge between distinct signal nodes, then opens only that branch",()=>{
    const model=base();
    const placement=placementTargets(model,{bridgeFrom:0}).find(target=>target.index===2)!;
    const bridged=placement.edit!.model;
    const switched=placementTargets(bridged,"switch").find(target=>target.kind==="branch-key")!.edit!.model;
    switched.branches![0].switch={closed:true,atS:.001,closes:false};
    const run=simulateNetwork(switched);
    // At t=0, the outgoing 50 Ω line is in parallel with the 100 Ω bridge in series
    // with the far node's 25 Ω equivalent (line port || matched termination).
    expect(at(run,0,0).u).toBeCloseTo(125/3);
    expect(at(run,2e6,0).u).toBeCloseTo(25/3);
    expect(at(run,2e6,.002).u).toBeCloseTo(0);
    expect(at(run,2e6,.012).u).toBeGreaterThan(0);
  });
  it("stamps a shunt to reference and rejects a scheduled contact with an RLC termination",()=>{
    const model=base();
    const shunt=placementTargets(model,"r").find(target=>target.kind==="branch"&&target.index===1)!.edit!.model;
    const run=simulateNetwork(shunt);
    expect(at(run,1e6,.006).u).toBeCloseTo(40);
    expect(at(run,1e6+1,.006).i).toBeCloseTo(.8);
    expect(validateNetwork({...shunt,load:{id:"load",kind:"c",value:1e-5},
      branches:[{...shunt.branches![0],switch:{closed:true,atS:.008,closes:false}}]})).toContain("reactive-live-events-not-supported:recalculate");
  });
});


it("applies a switch whose time shares the arrival tolerance with an incident front",()=>{
  const base=appendSection(DEFAULT_NETWORK).model;
  const run=simulateNetwork({...base,source:{...base.source,resistanceOhm:50},
    load:{id:"load",kind:"r",value:50},
    series:[{id:"K1",from:1,to:3,switch:{closed:false,atS:.005+5e-16,closes:true}}]});
  expect(at(run,2e6,.0101).u).toBeCloseTo(50);
});


describe("nonlinear termination and ideal wire",()=>{
 const matchedSource={...DEFAULT_NETWORK.source,resistanceOhm:50};
 for(const reversed of [false,true]){
  it(`balances the terminal characteristic with Shockley current (reversed=${reversed})`,()=>{
   const diode={...DEFAULT_DIODE,reversed};
   const run=simulateNetwork({...DEFAULT_NETWORK,source:matchedSource,load:{id:"D",kind:"diode",diode}});
   const arrival=at(run,1e6,.006);
   const sign=reversed?-1:1;
   expect(at(run,1e6,.004).u).toBe(0);
   expect(arrival.i).toBeCloseTo(sign*diodeCurrent(sign*arrival.u,diode),9);
   expect(arrival.u+50*arrival.i).toBeCloseTo(100,8);
   if(reversed)expect(arrival.u).toBeCloseTo(100,8);
   else expect(arrival.u).toBeLessThan(2);
   expect(at(run,1e6,.016).u).toBeCloseTo(arrival.u,8);
  });
 }
 it("preserves a voltage pulse and rejects nested nonlinear loads",()=>{
  const diode={id:"D",kind:"diode" as const,diode:DEFAULT_DIODE};
  const run=simulateNetwork({...DEFAULT_NETWORK,source:{...matchedSource,offS:.002},load:diode});
  expect(at(run,1e6,.006).i).toBeGreaterThan(0);
  expect(at(run,1e6,.008).u).toBeCloseTo(0,10);
  expect(validateNetwork({...DEFAULT_NETWORK,load:{id:"nest",kind:"series",children:[diode]}})).toContain("invalid-diode");
 });
 it("shorts a termination with a wire and joins distinct signal nodes without distributed delay",()=>{
  const model={...DEFAULT_NETWORK,source:matchedSource};
  const short=placementTargets(model,"wire").find(p=>p.kind==="end")!.edit!.model;
  expect(at(simulateNetwork(short),1e6,.006).u).toBe(0);
  const bridge=placementTargets(model,{bridgeFrom:0,wire:true}).find(p=>p.index===1)!.edit!.model;
  const run=simulateNetwork(bridge);
  expect(at(run,0,0).u).toBeCloseTo(100/3);
  expect(at(run,1e6,0).u).toBeCloseTo(100/3);
 });
});
