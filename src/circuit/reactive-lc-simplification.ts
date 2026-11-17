import { parseCircuit } from "./document";
import { splitReactivePort } from "./reactive-lc-mode";
import { reduceRlc } from "./rlc-reduction";
import { netlist, type CircuitTopology } from "./topology";
import { analyzeLcTopology, lcNominalTicks, type LcPortAnalysis, type LcTicks } from "../models/reactive-lc-graph";
import { bigintRatio, gcd } from "../models/lc-polynomial";

type ReducedBranch = {
  id: string;
  kind: "l" | "c";
  valueSI: number;
  firstNode: string;
  secondNode: string;
};
type ReductionStep = { id: string; kind: "l" | "c"; members: readonly [string, string]; connection: "series" | "parallel" };
export type SimplifiedLcGraph = {
  branches: readonly ReducedBranch[];
  steps: readonly ReductionStep[];
  result: LcPortAnalysis;
};

function combine(a: LcTicks, b: LcTicks, summed: boolean): LcTicks {
  const cross = a.numerator * b.denominator + b.numerator * a.denominator;
  const numerator = summed ? cross : a.numerator * b.numerator;
  const denominator = summed ? a.denominator * b.denominator : cross;
  const common = gcd(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

function samePort(a: LcPortAnalysis, b: LcPortAnalysis) {
  if (a.kind === "finite" && b.kind === "finite") {
    return (["numerator", "denominator"] as const).every(key =>
      a.impedance[key].length === b.impedance[key].length &&
      a.impedance[key].every((coefficient, index) => coefficient === b.impedance[key][index]));
  }
  return a.kind === b.kind;
}

export function simplifyReactiveDocument(document: string): SimplifiedLcGraph {
  const { drawing: { topology } } = parseCircuit(document);
  const original = splitReactivePort(topology);
  const originalAnalysis = analyzeLcTopology(original.topology, original.port);
  const zeroState: CircuitTopology = { ...topology, components: topology.components.map(part =>
    part.kind === "port" ? part : { ...part, parameters: { ...part.parameters, initial: 0 } }) };
  const reduction = reduceRlc(zeroState);
  if (!reduction.ok) throw Error("lc-simplification-conflict");
  const reduced = splitReactivePort(reduction.topology);

  const values = new Map(original.topology.components.map(part => [part.id, lcNominalTicks(part)]));
  const steps: ReductionStep[] = [];
  for (const [id, { connection, kind, members }] of reduction.equivalents) {
    const first = values.get(members[0].id)!;
    const second = values.get(members[1].id)!;
    values.set(id, combine(first, second, (connection === "series") !== (kind === "c")));
    steps.push({ id, kind: kind === "l" ? "l" : "c", members: [members[0].id, members[1].id], connection });
  }
  const result = analyzeLcTopology(reduced.topology, reduced.port, part => values.get(part.id)!);
  if (!samePort(originalAnalysis, result)) throw Error("lc-simplification-equivalence");

  const nodes = new Map(netlist(reduced.topology).flatMap((net, index) => {
    const label = net.includes(reduced.port[0]) ? reduced.port[0] : net.includes(reduced.port[1]) ? reduced.port[1] : "N" + (index + 1);
    return net.map(terminal => [terminal, label] as const);
  }));
  const branches = reduced.topology.components.map<ReducedBranch>(({ kind, id, terminals }) => {
    const { numerator, denominator } = values.get(id)!;
    return { id, kind: kind === "l" ? "l" : "c", valueSI: bigintRatio(numerator, denominator) * (kind === "l" ? 1e-6 : 1e-9),
      firstNode: nodes.get(terminals[0])!, secondNode: nodes.get(terminals[1])! };
  });
  return { branches, steps, result };
}
