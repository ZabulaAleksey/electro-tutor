import { describe, expect, it } from "vitest";
import { transmissionCircuitAdapter } from "../transient/circuit-adapter";
import { at, simulateNetwork } from "../transient/network";
import { reduceRlc } from "./rlc-reduction";
import { netlist, type CircuitComponent, type CircuitTopology, type Parameter } from "./topology";

type Edge = [kind: string, from: string, to: string, parameters: Record<string, Parameter>];
const properties = { r: "ohm", l: "henry", c: "farad" } as const;

function makeCircuit(edges: Edge[]): CircuitTopology {
  const junctions = [...new Set(edges.flatMap(([, from, to]) => [from, to]))];
  const components: CircuitComponent[] = edges.map(([kind, , , parameters], i) => ({
    id: "part" + i, kind, parameters, terminals: ["part" + i + ":a", "part" + i + ":b"],
  }));
  const wires = edges.flatMap(([, from, to], i) => [
    { id: "a" + i, from, to: components[i].terminals[0] },
    { id: "b" + i, from: to, to: components[i].terminals[1] },
  ]);
  return { junctions, components, wires };
}

function reduce(topology: CircuitTopology) {
  const result = reduceRlc(topology);
  if (!result.ok) throw Error(JSON.stringify(result));
  return result;
}

describe("RLC reduction", () => {
  it.each([
    ["r", "series", 5],
    ["r", "parallel", 1.2],
    ["l", "series", 5],
    ["l", "parallel", 1.2],
    ["c", "series", 1.2],
    ["c", "parallel", 5],
  ] as const)("reduces homogeneous %s in %s to %s", (kind, connection, expected) => {
    const series = connection === "series";
    const graph = makeCircuit([
      [kind, "left", series ? "middle" : "right", { [properties[kind]]: 2 }],
      [kind, series ? "middle" : "left", "right", { [properties[kind]]: 3 }],
    ]);
    const before = structuredClone(graph);
    const result = reduce(graph);
    expect(graph).toEqual(before);
    expect(result.topology.components).toHaveLength(1);
    expect(netlist(result.topology)).toHaveLength(2);
    const [equivalent] = result.topology.components;
    expect(equivalent.parameters[properties[kind]]).toBeCloseTo(expected, 12);
    expect(result.equivalents.get(equivalent.id)).toMatchObject({
      connection,
      members: [{ id: "part0", polarity: 1 }, { id: "part1", polarity: 1 }],
    });
  });

  it("keeps the third branch at an internal node, including a non-passive terminal", () => {
    const graph = makeCircuit([
      ["r", "left", "middle", { ohm: 2 }],
      ["r", "middle", "right", { ohm: 3 }],
      ["voltage", "ref", "middle", { voltageV: 10 }],
    ]);
    expect(reduce(graph).topology).toEqual(graph);
  });

  it.each(["r", "l", "c"] as const)("preserves scheduled %s elements in the calculation graph", kind => {
    const graph = makeCircuit([
      [kind, "start", "end", { [properties[kind]]: 50, changeAtS: .01 }],
      [kind, "start", "end", { [properties[kind]]: 20 }],
    ]);
    expect(reduce(graph).topology).toEqual(graph);
  });

  it.each([
    ["c", "series", 3, -2, 1.2, 5, 15],
    ["l", "parallel", 3, -2, 1.2, 5, 15],
    ["l", "series", 2, -2, 5, 2, 10],
    ["c", "parallel", 2, -2, 5, 2, 10],
  ] as const)("preserves signed initial state and energy for %s in %s", (kind, connection, a, b, value, initial, energy) => {
    const series = connection === "series";
    const result = reduce(makeCircuit([
      [kind, "start", series ? "middle" : "end", { [properties[kind]]: 2, initial: a }],
      [kind, "end", series ? "middle" : "start", { [properties[kind]]: 3, initial: b }],
    ]));
    const [equivalent] = result.topology.components;
    expect(equivalent.parameters[properties[kind]]).toBeCloseTo(value, 12);
    expect(equivalent.parameters.initial).toBeCloseTo(initial, 12);
    expect(.5 * Number(equivalent.parameters[properties[kind]]) * Number(equivalent.parameters.initial) ** 2).toBeCloseTo(energy, 12);
    expect(result.equivalents.get(equivalent.id)?.members.map(member => member.polarity)).toEqual([1, -1]);
  });

  it.each([
    ["l", "series"],
    ["c", "parallel"],
    ["c", "series"],
    ["l", "parallel"],
  ] as const)("detects or retains mismatched initial state for %s in %s", (kind, connection) => {
    const graph = makeCircuit([
      [kind, "start", connection === "series" ? "middle" : "end", { [properties[kind]]: 2, initial: 1 }],
      [kind, connection === "series" ? "middle" : "start", "end", { [properties[kind]]: 3, initial: 2 }],
    ]);
    if (kind === "l" && connection === "series" || kind === "c" && connection === "parallel") {
      expect(reduceRlc(graph)).toEqual({ ok: false, conflict: { kind, connection, components: ["part0", "part1"] } });
    } else {
      expect(reduce(graph).topology).toEqual(graph);
    }
  });

  it("keeps stored state when the normalized charge would underflow", () => {
    const graph = makeCircuit([
      ["c", "left", "middle", { farad: 1e-300, initial: 1e300 }],
      ["c", "middle", "right", { farad: 1e300, initial: 0 }],
    ]);
    expect(reduce(graph).topology).toEqual(graph);
  });

  it("does not turn underflowing positive resistance into a physical short", () => {
    const graph = makeCircuit([
      ["r", "left", "right", { ohm: Number.MIN_VALUE }],
      ["r", "left", "right", { ohm: Number.MIN_VALUE }],
    ]);
    expect(() => reduce(graph)).toThrow("invalid-rlc-equivalent");
  });

  it("keeps original IDs through nested reductions while preserving an independent connected element", () => {
    const graph = makeCircuit([
      ["r", "left", "middle", { ohm: 20 }],
      ["r", "left", "middle", { ohm: 20 }],
      ["r", "middle", "right", { ohm: 10 }],
      ["c", "pad", "right", { farad: .001 }],
    ]);
    const result = reduce(graph);
    expect(result.topology.components).toHaveLength(2);
    expect(result.topology.components.find(part => part.id === "part3")).toEqual(graph.components[3]);
    const equivalent = result.topology.components.find(part => part.kind === "r")!;
    expect(equivalent.parameters.ohm).toBe(20);
    const ids = (id: string): string[] => result.equivalents.get(id)?.members.flatMap(member => ids(member.id)) ?? [id];
    expect(ids(equivalent.id).sort()).toEqual(["part0", "part1", "part2"]);
  });

  it("passes a smaller real calculation model to the line adapter without changing the computed response", () => {
    const topology = makeCircuit([
      ["voltage", "input", "ref", { voltageV: 100, resistanceOhm: 50 }],
      ["line", "input", "load", { lengthM: 1e6, impedanceOhm: 50, velocityMS: 2e8 }],
      ["r", "load", "middle", { ohm: 25 }],
      ["r", "middle", "ref", { ohm: 25 }],
    ]);
    const before = transmissionCircuitAdapter.convert(topology).model;
    const result = reduce(topology);
    const after = transmissionCircuitAdapter.convert(result.topology).model;
    expect(before.load.children).toHaveLength(2);
    expect(after.load).toMatchObject({ kind: "r", value: 50 });
    expect(after.load.children).toBeUndefined();
    const original = simulateNetwork(before);
    const reduced = simulateNetwork(after);
    for (const t of [.001, .005, .006, .018]) expect(at(reduced, 1e6, t)).toEqual(at(original, 1e6, t));
    expect(at(reduced, 1e6, .006)).toMatchObject({u: 50, i: 1});
  });
});
