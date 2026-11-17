import { expect, it } from "vitest";
import { parseCircuit } from "../circuit/document";
import { freeCircuitMode } from "../circuit/editor-mode";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import type { CircuitTopology } from "../circuit/topology";
import { analyzeLcTopology } from "./reactive-lc-graph";
import { limits, reactance, resonances, solveCircuit } from "./reactive-two-port";

type Branch = readonly [string, string, "l" | "c", number];

function graph(branches: readonly Branch[], extraWires: CircuitTopology["wires"] = []): CircuitTopology {
  const junctions = [...new Set(["a", "b", ...branches.flatMap(([from, to]) => [from, to])])];
  const components = branches.map(([, , kind, value], index) => ({
    id: `part-${index}`, kind, terminals: [`part-${index}:a`, `part-${index}:b`],
    parameters: { [kind === "l" ? "henry" : "farad"]: value },
  }));
  const wires = branches.flatMap(([from, to], index) => [
    { id: `wire-${index}-a`, from, to: components[index].terminals[0] },
    { id: `wire-${index}-b`, from: to, to: components[index].terminals[1] },
  ]);
  return { junctions, components, wires: [...wires, ...extraWires] };
}

const asymmetric = [
  ["a", "x", "l", 0.02], ["x", "b", "c", 50e-6],
  ["a", "y", "c", 20e-6], ["y", "b", "l", 0.03],
  ["x", "y", "l", 0.01],
] as const;

it("computes a five-branch bridge using an independently assembled nodal reference", () => {
  const topology = graph(asymmetric);
  const solution = analyzeLcTopology(topology, ["a", "b"]);
  if (solution.kind !== "finite") throw Error("Expected a finite rational function");
  const z = solution.impedance;
  // Hand-built 3×3 KCL matrix in q², with 1 A entering a and b as the reference.
  expect(z).toEqual({ numerator: [0n, 600n, 0n, 580n, 0n, 60n], denominator: [10n, 0n, 26n, 0n, 11n] });
  expect(analyzeLcTopology(topology, ["b", "a"])).toEqual(solution);
  expect(reactance(z, 500)).toBeCloseTo(54.77611940298512, 9);
  expect(reactance(z, 1000)).toBeCloseTo(-16, 10);
  expect(reactance(z, 1800)).toBeCloseTo(-28.34628070311588, 9);
  expect(reactance(z, 3000)).toBeCloseTo(1.0794602698650753, 9);
  expect(reactance(z, 10000)).toBeCloseTo(50.51671166558038, 9);
  const roots = resonances(z);
  expect(roots.map(point => point.kind)).toEqual(["pole", "zero", "pole", "zero"]);
  expect(roots[0].omega).toBeCloseTo(1000 * Math.sqrt((13 - Math.sqrt(59)) / 11), 7);
  expect(roots[1].omega).toBeCloseTo(1000 * Math.sqrt((29 - Math.sqrt(481)) / 6), 7);
  expect(roots[2].omega).toBeCloseTo(1000 * Math.sqrt((13 + Math.sqrt(59)) / 11), 7);
  expect(roots[3].omega).toBeCloseTo(1000 * Math.sqrt((29 + Math.sqrt(481)) / 6), 7);
  expect(limits(z)).toEqual({ dc: "zero", high: "pole" });
});

it("cancels a balanced bridge mode and ignores floating and pendant LC branches", () => {
  const series = { kind: "series", left: { kind: "l", value: 20 }, right: { kind: "c", value: 50 } } as const;
  const equivalent = solveCircuit({ kind: "parallel", left: series, right: series }).impedance;
  const balanced = graph([
    ["a", "x", "l", 0.02], ["x", "b", "c", 50e-6],
    ["a", "y", "l", 0.02], ["y", "b", "c", 50e-6],
    ["x", "y", "l", 0.01], ["x", "tip", "c", 3e-6],
    ["island1", "island2", "l", 0.002],
  ]);
  const solution = analyzeLcTopology(balanced, ["a", "b"]);
  if (solution.kind !== "finite") throw Error("Expected a finite rational function");
  expect(solution.impedance).toEqual(equivalent);
  expect(resonances(solution.impedance)).toEqual([{ kind: "zero", omega: 1000 }]);
});

it("distinguishes open and short circuits at their physical port", () => {
  const topology = graph([["a", "x", "l", 0.02], ["b", "y", "c", 50e-6]]);
  expect(analyzeLcTopology(topology, ["a", "b"]).kind).toBe("open");
  const closed = graph([["a", "b", "l", 0.02]], [{ id: "port-short", from: "a", to: "b" }]);
  expect(analyzeLcTopology(closed, ["a", "b"]).kind).toBe("short");
  expect(() => analyzeLcTopology(topology, ["a", "missing"])).toThrow("invalid-lc-port");
});

it("checks exact nominal precision and limits matrix work", () => {
  expect(() => analyzeLcTopology(graph([["a", "b", "l", 0.02000003]]), ["a", "b"])).toThrow("invalid-lc-value");
  const tooMany = graph(Array.from({ length: 25 }, () => ["a", "b", "l", .02] as const));
  expect(() => analyzeLcTopology(tooMany, ["a", "b"])).toThrow("lc-graph-limit");
});

it("analyzes a graph at the node limit across widely separated LC scales", () => {
  const capacitorTicks = [1, 7, 25, 140, 900, 5000, 23000, 120000, 620000, 2300000, 90000000];
  const sections = capacitorTicks.map((ticks, i) => ({
    from: i === 0 ? "a" : `n${i}`, to: i === capacitorTicks.length - 1 ? "b" : `n${i + 1}`,
    l: (99_800_000 + 29 * i) / 1e6, c: ticks / 1e9,
  }));
  const solution = analyzeLcTopology(graph(sections.flatMap(({ from, to, l, c }) =>
    [[from, to, "l", l], [from, to, "c", c]])), ["a", "b"]);
  if (solution.kind !== "finite") throw Error("Expected a finite rational function");
  expect(solution.nodeCount).toBe(12);
  const omega = 37;
  const expected = sections.reduce((sum, { l, c }) => sum + omega * l / (1 - omega ** 2 * l * c), 0);
  expect(reactance(solution.impedance, omega)).toBeCloseTo(expected, 7);
  const roots = resonances(solution.impedance);
  expect(roots.filter(root => root.kind === "pole").length).toBe(11);
  expect(roots.filter(root => root.kind === "zero").length).toBe(10);
});

it("reads the real routed bridge document and keeps the measurement port out of the free palette", () => {
  const document = reactiveLcMode.createDefaultDocument();
  const { drawing, routing } = parseCircuit(document);
  expect(routing.unrouted).toEqual([]);
  expect(drawing.topology.components.filter(part => part.kind === "port").length).toBe(1);
  expect(reactiveLcMode.availableParts(drawing)).toEqual(["l", "c"]);
  expect(freeCircuitMode.availableParts(drawing).includes("port")).toBe(false);
  expect(reactiveLcMode.readModel(document)).toEqual(analyzeLcTopology(graph(asymmetric), ["a", "b"]));
  expect(() => reactiveLcMode.readModel(freeCircuitMode.createDefaultDocument())).toThrow("invalid-lc-port");
});
