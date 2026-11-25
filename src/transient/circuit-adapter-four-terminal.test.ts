import { describe, expect, it } from "vitest";
import { addComponent, connect, disconnect, netlist, type CircuitComponent, type CircuitTopology } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { at, loadLeaves, simulateNetwork } from "./network";

const lengthM = 1_000_000;
const impedanceOhm = 50;
const velocityMS = 200_000_000;
const delayS = lengthM / velocityMS;
const lineParameters = { lengthM, impedanceOhm, velocityMS };
const source: CircuitComponent = {
  id: "E1", kind: "voltage", terminals: ["E1:a", "E1:b"], parameters: { voltageV: 12, resistanceOhm: 50 },
};
const contact: CircuitComponent = {
  id: "K1", kind: "switch", terminals: ["K1:a", "K1:b"], parameters: { closed: true, atS: 0 },
};

function line(id: string, resistanceOhmM = 0): CircuitComponent {
  return {
    id, kind: "line", terminals: [id + ":a", id + ":b", id + ":return-in", id + ":return-out"],
    parameters: { ...lineParameters, resistanceOhmM },
  };
}

function load(id: string, kind: "r" | "l" | "c", parameters: CircuitComponent["parameters"]): CircuitComponent {
  return { id, kind, terminals: [id + ":a", id + ":b"], parameters };
}

function fixture(termination = load("R1", "r", { ohm: 50 }), resistanceOhmM = 0): CircuitTopology {
  return {
    components: [source, contact, line("TL1", resistanceOhmM), termination],
    junctions: [],
    wires: [
      { id: "W1", from: "E1:a", to: "K1:a" },
      { id: "W2", from: "K1:b", to: "TL1:a" },
      { id: "W3", from: "TL1:b", to: termination.terminals[0] },
      { id: "W4", from: termination.terminals[1], to: "TL1:return-out" },
      { id: "W5", from: "E1:b", to: "TL1:return-in" },
    ],
  };
}

describe("transient four-terminal line projection", () => {
  it("preserves two physical return nets and reproduces a matched wave without reflection", () => {
    const topology = fixture();
    const originalNets = netlist(topology);
    expect(originalNets).toContainEqual(["E1:b", "TL1:return-in"]);
    expect(originalNets).toContainEqual(["R1:b", "TL1:return-out"]);

    const converted = transmissionCircuitAdapter.convert(topology);
    expect(converted.model.load).toEqual({ id: "R1", kind: "r", value: impedanceOhm });
    expect(converted.resultPolarity.get("TL1")).toBe(1);
    expect(netlist(topology)).toEqual(originalNets);
    const run = simulateNetwork(converted.model);
    expect(at(run, lengthM, 0.9 * delayS).u).toBe(0);
    const terminal = at(run, lengthM, 1.5 * delayS);
    expect(terminal.forward).toBeCloseTo(6, 12);
    expect(terminal.backward / terminal.forward).toBeCloseTo(0, 12);
    expect(terminal.i).toBeCloseTo(6 / impedanceOhm, 12);
  });

  it.each(["W3", "W4"])("projects an open termination when %s is broken on either load lead", id => {
    const topology = disconnect(fixture(load("C1", "c", { farad: 1e-6, initial: 0 })), id);
    const { model, resultIds } = transmissionCircuitAdapter.convert(topology);
    expect(model.load.kind).toBe("open");
    expect(resultIds.has("C1")).toBe(false);
    const terminal = at(simulateNetwork(model), lengthM, 1.5 * delayS);
    expect(terminal.backward / terminal.forward).toBeCloseTo(1, 12);
    expect(terminal.i).toBeCloseTo(0, 12);
    expect(terminal.u).toBeCloseTo(12, 12);
  });

  it("projects a deliberate physical conductor at the final port as an exact short", () => {
    const topology = connect(fixture(), "short", "TL1:b", "TL1:return-out");
    const { model, resultIds } = transmissionCircuitAdapter.convert(topology);
    expect(model.load.kind).toBe("wire");
    expect(model.load.value).toBeUndefined();
    expect(resultIds.has("R1")).toBe(false);
    const terminal = at(simulateNetwork(model), lengthM, 1.5 * delayS);
    expect(terminal.backward / terminal.forward).toBeCloseTo(-1, 12);
    expect(terminal.forwardI + terminal.backwardI).toBeCloseTo(12 / impedanceOhm, 12);
    expect(terminal.u).toBeCloseTo(0, 12);
  });

  it("preserves a nested series/parallel load and excludes a dangling branch from the wave model", () => {
    let topology = disconnect(fixture(), "W4");
    topology = addComponent(topology, load("L1", "l", { henry: 0.015 }));
    topology = addComponent(topology, load("C1", "c", { farad: 1e-6 }));
    topology = addComponent(topology, load("Rfloat", "r", { ohm: 120, changeAtS: 0.003, nextOhm: 140 }));
    topology = connect(topology, "series-in", "R1:b", "L1:a");
    topology = connect(topology, "series-out", "L1:b", "TL1:return-out");
    topology = connect(topology, "parallel-in", "TL1:b", "C1:a");
    topology = connect(topology, "parallel-out", "C1:b", "TL1:return-out");
    topology = connect(topology, "dangling", "TL1:b", "Rfloat:a");

    const { model, resultIds } = transmissionCircuitAdapter.convert(topology);
    expect(model.load.kind).toBe("parallel");
    expect(loadLeaves(model.load).map(leaf => leaf.id).sort()).toEqual(["C1", "L1", "R1"]);
    expect(model.events).toEqual([]);
    expect(resultIds.has("Rfloat")).toBe(false);
    expect(Number.isFinite(at(simulateNetwork(model), lengthM, 1.5 * delayS).u)).toBe(true);
  });

  it("leaves a single-ended loop out of a live matched termination", () => {
    let topology = addComponent(fixture(), load("R2", "r", { ohm: 100 }));
    topology = addComponent(topology, load("C1", "c", { farad: 1e-6 }));
    topology = connect(topology, "limb-r", "TL1:b", "R2:a");
    topology = connect(topology, "limb-c", "TL1:b", "C1:a");
    topology = connect(topology, "floating-common", "R2:b", "C1:b");

    const { model, resultIds } = transmissionCircuitAdapter.convert(topology);
    expect(model.load).toEqual({ id: "R1", kind: "r", value: impedanceOhm });
    expect(resultIds.has("R2")).toBe(false);
    expect(resultIds.has("C1")).toBe(false);
  });

  it("converts a cascade in signal order, including a physically reversed section", () => {
    let topology = addComponent(disconnect(disconnect(fixture(), "W3"), "W4"), line("TL2"));
    topology = connect(topology, "signal-cascade", "TL1:b", "TL2:b");
    topology = connect(topology, "return-cascade", "TL1:return-out", "TL2:return-out");
    topology = connect(topology, "load-signal", "TL2:a", "R1:a");
    topology = connect(topology, "load-return", "R1:b", "TL2:return-in");

    const { model, resultPolarity } = transmissionCircuitAdapter.convert(topology);
    expect(model.sections.map(section => section.id)).toEqual(["TL1", "TL2"]);
    expect(resultPolarity.get("TL2")).toBe(-1);
    expect(model.load.kind).toBe("r");
    expect(at(simulateNetwork(model), 2 * lengthM, 1.9 * delayS).u).toBe(0);
    expect(at(simulateNetwork(model), 2 * lengthM, 2.2 * delayS).u).toBeCloseTo(6, 12);
    expect(() => transmissionCircuitAdapter.convert(disconnect(topology, "return-cascade"))).toThrow("open-line-cascade-return");
    expect(() => transmissionCircuitAdapter.convert(connect(topology, "signal-fault", "TL1:b", "TL1:return-out"))).toThrow("shorted-line-signal");
  });

  it("rejects a broken or bypassed input rail instead of joining it implicitly", () => {
    const topology = fixture();
    expect(() => transmissionCircuitAdapter.convert(disconnect(topology, "W2"))).toThrow("open-line-source-signal");
    expect(() => transmissionCircuitAdapter.convert(disconnect(topology, "W5"))).toThrow("open-line-source-return");
    const bypass = connect(topology, "return-bypass", "E1:b", "TL1:return-out");
    expect(() => transmissionCircuitAdapter.convert(bypass)).toThrow("bypassed-line-return");
    const externalReturn = connect(disconnect(topology, "W4"), "external-return", "R1:b", "E1:b");
    expect(() => transmissionCircuitAdapter.convert(externalReturn)).toThrow("bypassed-line-return");
    const signalFault = connect(topology, "signal-fault", "TL1:b", "TL1:return-in");
    expect(() => transmissionCircuitAdapter.convert(signalFault)).toThrow("shorted-line-signal");
  });

  it("matches the distortionless loss formula with finite delayed voltage and current", () => {
    const resistanceOhmM = 1e-5;
    const { model } = transmissionCircuitAdapter.convert(fixture(undefined, resistanceOhmM));
    const expected = 6 * Math.exp(-resistanceOhmM * lengthM / impedanceOhm);
    const run = simulateNetwork(model);
    expect(at(run, lengthM, 0.9 * delayS).u).toBe(0);
    const terminal = at(run, lengthM, 1.5 * delayS);
    expect(terminal.u).toBeCloseTo(expected, 12);
    expect(terminal.i).toBeCloseTo(expected / impedanceOhm, 12);
    expect(terminal.backward).toBeCloseTo(0, 12);
  });
});
