import { describe, expect, it } from "vitest";
import { at, DEFAULT_NETWORK, nodePort, simulateNetwork, validateNetwork, type Network } from "./network";

function experiment(): Network {
  return {
    ...structuredClone(DEFAULT_NETWORK),
    source: { voltageV: 0, currentA: 2, resistanceOhm: 0, node: 0, onS: 0, offS: .0075 },
    load: { id: "load", kind: "r", value: 50 },
  };
}
describe("independent current excitation", () => {
  it("launches IZ voltage, propagates at the physical delay and switches off as an open source", () => {
    const run = simulateNetwork(experiment());
    expect(nodePort(run,0,.002).u).toBeCloseTo(100);
    expect(nodePort(run,0,.002).intoLines).toBeCloseTo(2);
    expect(at(run,1e6,.004).u).toBeCloseTo(0);
    expect(at(run,1e6,.006).u).toBeCloseTo(100);
    expect(at(run,1e6,.013).u).toBeCloseTo(0);
  });
  it("drives a reactive terminal using the same current injection", () => {
    const model = experiment();
    model.load = { id:"load",kind:"c",value:1e-5 };
    const run = simulateNetwork(model);
    expect(run.method).toBe("characteristics-trapezoid");
    expect(at(run,1e6,.004).u).toBeCloseTo(0,2);
    expect(at(run,1e6,.006).u).toBeGreaterThan(100);
    expect(at(run,1e6,.006).u).toBeLessThan(200);
  });
  it("stamps current at the source node with an explicit parallel branch", () => {
    const model = experiment();
    model.branches = [{ id: "R1", from: 0, to: "reference", resistanceOhm: 50 }];
    const run = simulateNetwork(model);
    expect(nodePort(run,0,.002).u).toBeCloseTo(50);
    expect(nodePort(run,0,.002).intoLines).toBeCloseTo(1);
    expect(at(run,1e6,.006).u).toBeCloseTo(50);
    expect(validateNetwork({...model,source:{...model.source,voltageV:1}})).toContain("invalid-source-or-time");
  });
});
