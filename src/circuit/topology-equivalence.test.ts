import { describe, expect, it } from "vitest";
import { moveSeriesEquivalent, reduceTopologyRlc, simplifyTopologyForView } from "./topology-equivalence";
import { netlist, validateCircuit, type CircuitTopology, type Parameter } from "./topology";

type Part = [id: string, kind: string, from: string, to: string, parameters: Record<string, Parameter>];

function circuit(parts: Part[]): CircuitTopology {
  return {
    junctions: [...new Set(parts.flatMap(([, , from, to]) => [from, to]))],
    components: parts.map(([id, kind, , , parameters]) => ({ id, kind, terminals: [id + ":a", id + ":b"], parameters })),
    wires: parts.flatMap(([id, , from, to]) => [
      { id: id + "-a", from, to: id + ":a" },
      { id: id + "-b", from: to, to: id + ":b" },
    ]),
  };
}

function loadExample() {
  return circuit([
    ["L1", "l", "input", "a", { henry: .02 }],
    ["R1", "r", "a", "b", { ohm: 3 }],
    ["C1", "c", "b", "output", { farad: .001 }],
    ["load", "r", "output", "ground", { ohm: 7 }],
  ]);
}

function order(topology: CircuitTopology, start = "input", end = "ground") {
  const terminalNet = new Map(netlist(topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  let node = terminalNet.get(start)!;
  const seen = new Set<string>();
  const path = [];
  while (node !== terminalNet.get(end)) {
    const edges = topology.components.filter(part => !seen.has(part.id) &&
      part.terminals.some(terminal => terminalNet.get(terminal) === node));
    expect(edges).toHaveLength(1);
    const part = edges[0];
    const currentIsPositive = terminalNet.get(part.terminals[0]) === node;
    node = terminalNet.get(part.terminals[currentIsPositive ? 1 : 0])!;
    seen.add(part.id);
    path.push({ part, currentIsPositive });
  }
  return path;
}

/** Independent AC voltage divider evaluated against the actual connected path. */
function loadResponse(topology: CircuitTopology, frequency: number) {
  const omega = 2 * Math.PI * frequency;
  const path = order(topology);
  expect(path.at(-1)?.part.id).toBe("load");
  let r = 0;
  let x = 0;
  for (const { part } of path) {
    if (part.kind === "r") r += Number(part.parameters.ohm);
    else if (part.kind === "l") x += omega * Number(part.parameters.henry);
    else if (part.kind === "c") x -= 1 / (omega * Number(part.parameters.farad));
    else throw new Error("unexpected component in test circuit");
  }
  const loadOhm = Number(path.at(-1)!.part.parameters.ohm);
  const absSquared = r ** 2 + x ** 2;
  return { z: [r, x], gain: [loadOhm * r / absSquared, -loadOhm * x / absSquared] };
}

describe("series R/L relocation", () => {
  it("moves the original L past R and C while retaining loaded impedance, transfer and observed boundary ports", () => {
    const before = loadExample();
    const snapshot = structuredClone(before);
    const observed = ["input", "output", "ground"];
    const moved = moveSeriesEquivalent(before, "L1", "C1-b", 0, observed);
    expect(before).toEqual(snapshot);
    expect(moved.components).toBe(before.components);
    expect(moved.wires).toHaveLength(before.wires.length);
    expect(moved.wires.find(wire => wire.id === "load-a")).toBe(before.wires.find(wire => wire.id === "load-a"));
    expect(validateCircuit(moved)).toEqual([]);
    expect(order(before).map(({ part }) => part.id)).toEqual(["L1", "R1", "C1", "load"]);
    expect(order(moved).map(({ part }) => part.id)).toEqual(["R1", "C1", "L1", "load"]);
    for (const frequency of [.1, 1, 50, 1e3, 1e5]) {
      const actual = loadResponse(moved, frequency);
      const original = loadResponse(before, frequency);
      expect(actual).toEqual(original);
      expect(actual.z[0]).toBe(10);
    }
  });

  it("adds an ideal series increment at the new location and retains all other nominal values", () => {
    const before = loadExample();
    const moved = moveSeriesEquivalent(before, "L1", "C1-b", .03);
    expect(moved.components.map(part => part.id)).toEqual(before.components.map(part => part.id));
    expect(moved.components.find(part => part.id === "L1")?.parameters.henry).toBeCloseTo(.05, 15);
    expect(moved.components.find(part => part.id === "R1")).toBe(before.components[1]);
    const frequency = 1e3;
    const original = loadResponse(before, frequency);
    const changed = loadResponse(moved, frequency);
    expect(changed.z[1] - original.z[1]).toBeCloseTo(2 * Math.PI * frequency * .03, 10);
    const movedR = moveSeriesEquivalent(before, "R1", "C1-b", 2);
    expect(order(movedR).map(({ part }) => part.id)).toEqual(["L1", "C1", "R1", "load"]);
    expect(loadResponse(movedR, frequency).z[0]).toBe(12);
  });

  it("retains signed initial current when the inductor points against traversal and moves in the other direction", () => {
    const before = circuit([
      ["R1", "r", "input", "middle", { ohm: 3 }],
      ["L1", "l", "output", "middle", { henry: .02, initial: -1.5 }],
      ["load", "r", "output", "ground", { ohm: 7 }],
    ]);
    const moved = moveSeriesEquivalent(before, "L1", "R1-a", 0, ["input", "output"]);
    const [first] = order(moved);
    expect(first.part.id).toBe("L1");
    expect(first.currentIsPositive).toBe(false);
    expect(first.part.parameters.initial).toBe(-1.5);
    expect(() => moveSeriesEquivalent(before, "L1", "R1-a", .01)).toThrow("unsafe-series-move");
  });

  it("treats relocation to the existing connection as a true no-op unless the nominal changes", () => {
    const before = loadExample();
    expect(moveSeriesEquivalent(before, "L1", "L1-b", 0)).toBe(before);
    const increased = moveSeriesEquivalent(before, "L1", "L1-b", .01);
    expect(increased.wires).toBe(before.wires);
    expect(increased.components[0].parameters.henry).toBeCloseTo(.03, 15);
  });

  it("rejects crossings at observed internal nodes and references to the moved terminal itself", () => {
    const before = loadExample();
    for (const endpoint of ["a", "R1:b", "L1:a"]) {
      expect(() => moveSeriesEquivalent(before, "L1", "C1-b", 0, [endpoint])).toThrow("unsafe-series-move");
    }
    expect(() => moveSeriesEquivalent(before, "L1", "C1-b", 0, ["absent"])).toThrow("unknown-observed-endpoint");
  });

  it("rejects branch crossings, insertion into a shunt and bypassed conductors", () => {
    const before = loadExample();
    const shunted = { ...before, components: [...before.components, {
      id: "shunt", kind: "c", terminals: ["shunt:a", "shunt:b"], parameters: { farad: .002 },
    }], wires: [...before.wires,
      { id: "shunt-a", from: "output", to: "shunt:a" },
      { id: "shunt-b", from: "ground", to: "shunt:b" },
    ] };
    expect(() => moveSeriesEquivalent(shunted, "L1", "load-a", 0)).toThrow("unsafe-series-move");
    const tapped = circuit([
      ["L1", "l", "input", "a", { henry: .02 }],
      ["R1", "r", "a", "b", { ohm: 3 }],
      ["Rtap", "r", "a", "ground", { ohm: 5 }],
      ["C1", "c", "b", "ground", { farad: .001 }],
    ]);
    expect(() => moveSeriesEquivalent(tapped, "L1", "C1-b", 0)).toThrow("unsafe-series-move");
    const bypassed = { ...before, junctions: [...before.junctions, "bridge"], wires: [
      ...before.wires, { id: "bypass-a", from: "C1:b", to: "bridge" }, { id: "bypass-b", from: "bridge", to: "output" },
    ] };
    expect(() => moveSeriesEquivalent(bypassed, "L1", "C1-b", 0)).toThrow("unsafe-series-move");
  });

  it("rejects ambiguous closed passive loops even if one traversal encounters an observation", () => {
    const loop = circuit([
      ["L1", "l", "a", "b", { henry: .02 }],
      ["R1", "r", "b", "c", { ohm: 3 }],
      ["R2", "r", "c", "a", { ohm: 7 }],
    ]);
    expect(() => moveSeriesEquivalent(loop, "L1", "R1-b", 0, ["a"])).toThrow("unsafe-series-move");
  });

  it("rejects scheduled R, incompatible L currents and a coupled L encoded on another component", () => {
    const incompatible = circuit([
      ["L1", "l", "input", "a", { henry: .02, initial: 1 }],
      ["L2", "l", "a", "b", { henry: .03, initial: -1 }],
      ["R1", "r", "b", "output", { ohm: 3 }],
    ]);
    expect(() => moveSeriesEquivalent(incompatible, "L1", "R1-b", 0)).toThrow("unsafe-series-move");
    const scheduled = circuit([
      ["L1", "l", "input", "a", { henry: .02 }],
      ["R1", "r", "a", "b", { ohm: 3, changeAtS: .01, nextOhm: 9 }],
    ]);
    expect(() => moveSeriesEquivalent(scheduled, "L1", "R1-b", 0)).toThrow("unsafe-series-move");
    expect(() => moveSeriesEquivalent(scheduled, "R1", "L1-a", 0)).toThrow("unsafe-series-move");
    const coupled = circuit([
      ["L1", "l", "input", "a", { henry: .02 }],
      ["R1", "r", "a", "b", { ohm: 3 }],
      ["L2", "l", "x", "y", { henry: .03, coupledTo: "L1" }],
    ]);
    expect(() => moveSeriesEquivalent(coupled, "L1", "R1-b", 0)).toThrow("unsafe-series-move");
  });

  it("reports unsupported components and invalid increments without a graph change", () => {
    const before = loadExample();
    expect(() => moveSeriesEquivalent(before, "C1", "L1-b", 0)).toThrow("unsupported-series-component");
    expect(() => moveSeriesEquivalent(before, "L1", "missing", 0)).toThrow("unknown-series-wire");
    for (const extra of [-1, Infinity, NaN, Number.MIN_VALUE]) {
      expect(() => moveSeriesEquivalent(before, "L1", "C1-b", extra)).toThrow("invalid-series-increment");
    }
  });
});

describe("protected RLC calculation reduction", () => {
  it("projects adjacent inductors and keeps taps or incompatible states expanded", () => {
    const chain = circuit([
      ["P1", "port", "input", "output", {}],
      ["L1", "l", "input", "a", { henry: .02, initial: 1 }],
      ["L2", "l", "a", "output", { henry: .03, initial: 1 }],
    ]);
    const projected = simplifyTopologyForView(chain, ["P1:a", "P1:b"]);
    expect(projected.components.filter(part => part.kind === "l")).toHaveLength(1);
    expect(projected.components.find(part => part.kind === "l")?.parameters.henry).toBeCloseTo(.05);
    expect(simplifyTopologyForView(chain, ["a"])).toEqual(chain);
    const tapped = circuit([
      ["L1", "l", "input", "a", { henry: .02 }],
      ["L2", "l", "a", "output", { henry: .03 }],
      ["R1", "r", "a", "ground", { ohm: 4 }],
    ]);
    expect(simplifyTopologyForView(tapped, ["input", "output"]).components.map(part => part.id)).toContain("L1");
    const mismatched = circuit([
      ["L1", "l", "input", "a", { henry: .02, initial: 1 }],
      ["L2", "l", "a", "output", { henry: .03, initial: -1 }],
    ]);
    expect(simplifyTopologyForView(mismatched, ["input", "output"])).toEqual(mismatched);
  });
  it("preserves an observed original net exactly while reducing a different unobserved group", () => {
    const before = circuit([
      ["R1", "r", "in1", "observation", { ohm: 2 }],
      ["R2", "r", "observation", "out1", { ohm: 3 }],
      ["C1", "c", "in2", "out2", { farad: .001 }],
      ["C2", "c", "in2", "out2", { farad: .002 }],
    ]);
    const result = reduceTopologyRlc(before, ["observation", "R2:a"]);
    if (!result.ok) throw new Error("unexpected reduction conflict");
    const netOfObservation = (topology: CircuitTopology) => netlist(topology).find(net => net.includes("observation"));
    expect(netOfObservation(result.topology)).toEqual(netOfObservation(before));
    expect(result.topology.wires.filter(wire => wire.from === "observation")).toEqual(before.wires.filter(wire => wire.from === "observation"));
    expect(result.topology.components).toHaveLength(3);
    const combined = result.topology.components.find(part => part.kind === "c")!;
    expect(combined.parameters.farad).toBeCloseTo(.003, 15);
    expect(result.equivalents.get(combined.id)?.members.map(member => member.id)).toEqual(["C1", "C2"]);
    expect(() => reduceTopologyRlc(before, ["gone"])).toThrow("unknown-observed-endpoint");
  });

  it("keeps a supported combination and proves its impedance over multiple decades", () => {
    const before = circuit([
      ["L1", "l", "input", "a", { henry: .01 }],
      ["L2", "l", "a", "output", { henry: .02 }],
      ["load", "r", "output", "ground", { ohm: 7 }],
    ]);
    // These boundary identifiers belong to the original drawing, so the
    // unobserved calculation variant is inspected from the surviving lead.
    const result = reduceTopologyRlc(before);
    if (!result.ok) throw new Error("unexpected reduction conflict");
    const equivalent = result.topology.components.find(part => part.kind === "l")!;
    expect(equivalent.parameters.henry).toBeCloseTo(.03, 15);
    const loadNet = netlist(result.topology).find(net => net.includes("load:a"))!;
    const otherEnd = equivalent.terminals.find(terminal => !loadNet.includes(terminal))!;
    for (const frequency of [.01, 50, 1e5]) {
      const omega = 2 * Math.PI * frequency;
      const beforeX = loadResponse(before, frequency).z[1];
      const after = order(result.topology, otherEnd, "load:b");
      expect(after.map(({ part }) => part.kind)).toEqual(["l", "r"]);
      expect(omega * Number(after[0].part.parameters.henry) / beforeX).toBeCloseTo(1, 14);
    }
  });

  it("does not fold inductors when another branch carries unsupported coupling information", () => {
    const before = circuit([
      ["L1", "l", "a", "b", { henry: .02 }],
      ["L2", "l", "b", "c", { henry: .03 }],
      ["L3", "l", "x", "y", { henry: .02, coupledTo: "L1" }],
    ]);
    const result = reduceTopologyRlc(before);
    expect(result).toEqual({ ok: true, topology: before, equivalents: new Map() });
  });
});
