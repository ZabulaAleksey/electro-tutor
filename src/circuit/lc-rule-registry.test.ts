import { describe, expect, it } from "vitest";
import { exactLcParameters, lcNominalSI, type LcKind, type LcTicks } from "../models/lc-nominal";
import { multiply } from "../models/lc-polynomial";
import { lcNominalTicks } from "../models/reactive-lc-graph";
import { applyLcRule, planLcTransforms, type LcRuleId, type LcTransformStep } from "./lc-rule-registry";
import { netlist, type CircuitTopology } from "./topology";

type Device = [id: string, kind: LcKind, a: string, b: string, numerator: bigint, denominator?: bigint];
function graph(devices: Device[]): CircuitTopology {
  return {
    junctions: [...new Set(devices.flatMap(([, , a, b]) => [a, b]))].sort(),
    components: devices.map(([id, kind, , , numerator, denominator = 1n]) =>
      ({ id, kind, terminals: [id + ":a", id + ":b"], parameters: exactLcParameters(kind, { numerator, denominator }) })),
    wires: devices.flatMap(([id, , a, b]) => [{ id: "W:" + id + ":a", from: a, to: id + ":a" }, { id: "W:" + id + ":b", from: b, to: id + ":b" }]),
  };
}

function exactProofs(step: LcTransformStep) {
  for (const { before, after } of step.proofs) {
    expect(multiply(before.numerator, after.denominator)).toEqual(multiply(after.numerator, before.denominator));
  }
}

function reactance(topology: CircuitTopology, ports: readonly [string, string], omega: number) {
  const nets = netlist(topology);
  const netOf = new Map(nets.flatMap((net, index) => net.map(id => [id, index] as const)));
  const boundaries = new Set(ports.map(id => netOf.get(id)!));
  let branches = topology.components.map(part => {
    const nominal = lcNominalSI(part.kind as LcKind, lcNominalTicks(part));
    const [a, b] = part.terminals.map(id => netOf.get(id)!).sort((x, y) => x - y);
    return { a, b, x: part.kind === "l" ? omega * nominal : -1 / (omega * nominal) };
  });
  const combine = (first: typeof branches[number], second: typeof branches[number], piece: typeof branches[number]) => {
    branches = [...branches.filter(branch => branch !== first && branch !== second), piece];
  };
  // Evaluate impedances directly at one frequency. This oracle uses scalar
  // wave-independent arithmetic instead of the production polynomial MNA.
  while (branches.length > 1) {
    const leaves = nets.flatMap((_, node) => {
      const touching = branches.filter(branch => branch.a === node || branch.b === node);
      return !boundaries.has(node) && touching.length === 1 ? touching : [];
    });
    if (leaves.length) {
      branches = branches.filter(branch => !leaves.includes(branch));
      continue;
    }
    const firstOverlap = branches.find(branch => branches.some(other => other !== branch && other.a === branch.a && other.b === branch.b));
    if (firstOverlap) {
      const second = branches.find(other => other !== firstOverlap && other.a === firstOverlap.a && other.b === firstOverlap.b)!;
      const x = firstOverlap.x === 0 || second.x === 0 ? 0 : 1 / (1 / firstOverlap.x + 1 / second.x);
      combine(firstOverlap, second, { ...firstOverlap, x });
      continue;
    }
    const inside = nets.flatMap((_, node) => {
      const touching = branches.filter(branch => branch.a === node || branch.b === node);
      return !boundaries.has(node) && touching.length === 2 ? [{ node, touching }] : [];
    })[0];
    if (!inside) throw Error("Fixture is not a series-parallel network");
    const [first, second] = inside.touching;
    const [a, b] = [first, second].map(branch => branch.a === inside.node ? branch.b : branch.a).sort((x, y) => x - y);
    combine(first, second, { a, b, x: first.x + second.x });
  }
  return branches[0].x;
}

function sweep(step: LcTransformStep, extra: number[] = []) {
  const probes = [1e-4, .01, 1, 100, 1000, 10000, 1e6, 1e9, ...extra];
  for (const { terminals } of step.proofs) {
    for (const omega of probes) {
      const before = reactance(step.before, terminals, omega), after = reactance(step.after, terminals, omega);
      expect(Math.abs(before - after) / Math.max(1, Math.abs(before), Math.abs(after)), `${step.ruleId} @ ${omega} rad/s`)
        .toBeLessThan(2e-7);
    }
  }
}

function apply(topology: CircuitTopology, rule: LcRuleId, observed: string[] = ["A", "B"]) {
  const result = applyLcRule(topology, rule, observed);
  expect(result).toBeDefined();
  expect(result!.steps).toHaveLength(1);
  exactProofs(result!.steps[0]);
  return result!;
}

describe("LC-02 exact graph patterns", () => {
  it.each([
    ["l-series", "l", false, { numerator: 7n, denominator: 3n }],
    ["l-parallel", "l", true, { numerator: 4n, denominator: 7n }],
    ["c-series", "c", false, { numerator: 4n, denominator: 7n }],
    ["c-parallel", "c", true, { numerator: 7n, denominator: 3n }],
  ] satisfies [LcRuleId, LcKind, boolean, LcTicks][])("proves %s and preserves the original impedance across the port", (rule, kind, parallel, expected) => {
    const topology = graph([["X1", kind, "A", parallel ? "B" : "M", 1n], ["X2", kind, parallel ? "A" : "M", "B", 4n, 3n]]);
    const result = apply(topology, rule);
    expect(result.steps[0].added[0].ticks).toEqual(expected);
    sweep(result.steps[0]);
  });

  it.each(["l", "c"] as const)("proves all three open-third pairs of the %s star and inverse triangle", kind => {
    const topology = graph([["X1", kind, "M", "A", 17n], ["X2", kind, "M", "B", 11n, 7n], ["X3", kind, "M", "C", 19n]]);
    const forward = apply(topology, `${kind}-y-to-delta`, ["A", "B", "C"]);
    expect(forward.steps[0].proofs.map(proof => proof.terminals)).toEqual([["A", "B"], ["A", "C"], ["B", "C"]]);
    sweep(forward.steps[0]);
    const back = apply(forward.topology, `${kind}-delta-to-y`, ["A", "B", "C"]);
    sweep(back.steps[0]);
    expect(back.steps[0].added.map(part => part.ticks)).toEqual(forward.steps[0].removed.map(part => part.ticks));
  });

  it("proves the capacitive forward/inverse rules through extrema and near both resonances", () => {
    const topology = graph([["L1", "l", "A", "M", 11_000n], ["C2", "c", "A", "M", 91_000n], ["C3", "c", "M", "B", 173_000n]]);
    const forward = apply(topology, "lc-capacitive-forward");
    expect(forward.steps[0].added.find(part => part.role === "Cp")?.ticks).toEqual({ numerator: 1_967_875n, denominator: 33n });
    for (const { before, after } of forward.steps[0].proofs) {
      for (const value of [before, after]) {
        expect(value.numerator.findIndex(coefficient => coefficient !== 0n) - value.denominator.findIndex(coefficient => coefficient !== 0n)).toBe(-1);
        expect(value.numerator.length - value.denominator.length).toBe(-1);
      }
    }
    const frequencies = [1 / Math.sqrt(.011 * 91e-6), 1 / Math.sqrt(.011 * (91 + 173) * 1e-6)]
      .flatMap(value => [value * .99999, value * 1.00001]);
    sweep(forward.steps[0], frequencies);
    sweep(apply(forward.topology, "lc-capacitive-inverse").steps[0], frequencies);
  });

  it("proves the dimensionally correct L/C dual and inverse for seeded positive exact values", () => {
    let seed = 743_917;
    const next = () => { seed = (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0; return BigInt(seed % 99_999 + 1); };
    for (let i = 0; i < 18; i++) {
      const topology = graph([["C1", "c", "A", "M", next()], ["L2", "l", "M", "B", next()], ["L3", "l", "A", "B", i === 0 ? 1n : next()]]);
      const forward = apply(topology, "lc-inductive-forward");
      const back = apply(forward.topology, "lc-inductive-inverse");
      sweep(forward.steps[0]);
      sweep(back.steps[0]);
    }
  });

  it("refuses an interior tap, protected endpoint, degenerate triangle and energized replacement", () => {
    const y = graph([["L1", "l", "M", "A", 3n], ["L2", "l", "M", "B", 5n], ["L3", "l", "M", "C", 7n]]);
    expect(applyLcRule(y, "l-y-to-delta", ["M"])).toBeUndefined();
    expect(applyLcRule(y, "l-y-to-delta", ["L1:a"])).toBeUndefined();
    const tapped = graph([["L1", "l", "M", "A", 3n], ["L2", "l", "M", "B", 5n], ["L3", "l", "M", "C", 7n], ["C4", "c", "M", "D", 9n]]);
    expect(applyLcRule(tapped, "l-y-to-delta")).toBeUndefined();
    const ring = graph([["L1", "l", "A", "B", 3n], ["L2", "l", "B", "C", 5n], ["L3", "l", "C", "C", 7n]]);
    expect(applyLcRule(ring, "l-delta-to-y")).toBeUndefined();
    const energized = { ...y, components: y.components.map(part => part.id === "L1" ? { ...part, parameters: { ...part.parameters, initial: 2 } } : part) };
    expect(applyLcRule(energized, "l-y-to-delta")).toBeUndefined();
  });
});

describe("LC-03 bounded reduction planning", () => {
  const topology = graph([["L1", "l", "M", "A", 3n], ["L2", "l", "M", "B", 5n], ["L3", "l", "M", "C", 7n], ["L4", "l", "A", "B", 11n]]);
  const observed = ["A", "B", "C"];
  it("uses a neutral star/triangle rewrite only when it opens a real reduction", () => {
    const plan = planLcTransforms(topology, observed);
    expect(plan.steps.map(step => step.ruleId)).toEqual(["l-y-to-delta", "l-parallel"]);
    expect(plan.topology.components).toHaveLength(3);
    expect(plan.topology.junctions).toEqual(observed);
    expect(plan.steps.every(step => step.proofs.length)).toBe(true);
    const shuffled = { ...topology, components: [...topology.components].reverse(), wires: [...topology.wires].reverse() };
    expect(planLcTransforms(shuffled, observed).steps.map(step => [step.ruleId, step.removed.map(part => part.id)]))
      .toEqual(plan.steps.map(step => [step.ruleId, step.removed.map(part => part.id)]));
  });

  it("reports its candidate or depth budget and does not cycle through inverse rules", () => {
    expect(planLcTransforms(topology, observed, lcNominalTicks, { maxDepth: 0 })).toMatchObject({ explored: 0, exhausted: true, steps: [] });
    expect(planLcTransforms(topology, observed, lcNominalTicks, { maxCandidates: 0 })).toMatchObject({ explored: 0, exhausted: true, steps: [] });
    const simple = graph([["L1", "l", "M", "A", 3n], ["L2", "l", "M", "B", 5n], ["L3", "l", "M", "C", 7n]]);
    expect(planLcTransforms(simple, observed, lcNominalTicks, { maxDepth: 5, maxCandidates: 16 }))
      .toMatchObject({ exhausted: false, steps: [] });
  });

  it("preserves component and wire IDs outside a patched region", () => {
    const source = graph([["C1", "c", "A", "B", 100n], ["C2", "c", "A", "B", 300n], ["L9", "l", "B", "D", 500n]]);
    const plan = planLcTransforms(source, ["A", "B", "D"]);
    expect(plan.steps.map(step => step.ruleId)).toEqual(["c-parallel"]);
    expect(plan.topology.components.find(part => part.id === "L9")).toBe(source.components[2]);
    expect(plan.topology.wires.filter(wire => wire.id.startsWith("W:L9"))).toEqual(source.wires.slice(-2));
  });
});
