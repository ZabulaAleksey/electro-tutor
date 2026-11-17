import { netlist, type CircuitTopology, type ElementId } from "../circuit/topology";
import {
  add, exactQuotient, gcd, multiply, reduce, scale, shift,
  type Fraction, type Polynomial,
} from "./lc-polynomial";
import { isNominal } from "./reactive-two-port";

export const MAX_LC_GRAPH_COMPONENTS = 24;
export const MAX_LC_GRAPH_NETS = 12;

export type LcPortAnalysis =
  | { kind: "open" | "short" }
  | { kind: "finite"; impedance: Fraction; nodeCount: number };

function determinant(matrix: readonly Polynomial[][]): Polynomial {
  const count = matrix.length;
  if (count === 0) return [1n];
  const work = matrix.map(row => row.slice());
  let previous: Polynomial = [1n];
  // At real q > 0 the connected grounded Laplacian is positive definite,
  // as is every leading principal minor. No symbolic pivot can vanish identically.
  for (let k = 0; k < count - 1; k++) {
    const pivot = work[k][k];
    for (let i = k + 1; i < count; i++) {
      for (let j = k + 1; j < count; j++) {
        const numerator = add(multiply(work[i][j], pivot),
          scale(multiply(work[i][k], work[k][j]), -1n));
        work[i][j] = exactQuotient(numerator, previous);
      }
    }
    previous = pivot;
  }
  return work[count - 1][count - 1];
}

/**
 * Uses exact nominal ticks shared with the LC tree. The internal variable
 * t = q², q = s/(1000 rad/s), keeps the grounded matrix degree small.
 */
export function analyzeLcTopology(
  topology: CircuitTopology, port: readonly [ElementId, ElementId],
): LcPortAnalysis {
  if (topology.components.length > MAX_LC_GRAPH_COMPONENTS) throw Error("lc-graph-limit");
  const nets = netlist(topology);
  const netOf = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const source = netOf.get(port[0]);
  const reference = netOf.get(port[1]);
  if (source === undefined || reference === undefined || port[0] === port[1]) throw Error("invalid-lc-port");

  const branches = topology.components.map(({ kind, terminals, parameters }) => {
    if ((kind !== "l" && kind !== "c") || terminals.length !== 2) throw Error("invalid-lc-component");
    const value = kind === "l" ? parameters.henry : parameters.farad;
    const nominal = typeof value === "number" ? value * (kind === "l" ? 1000 : 1_000_000) : undefined;
    if (!isNominal(nominal)) throw Error("invalid-lc-value");
    return { from: netOf.get(terminals[0])!, to: netOf.get(terminals[1])!, kind, ticks: BigInt(Math.round(nominal * 1000)) };
  }).filter(branch => branch.from !== branch.to);
  if (source === reference) return { kind: "short" };
  const connected = new Set([source]);
  for (const node of connected) {
    for (const branch of branches) {
      if (branch.from === node) connected.add(branch.to);
      if (branch.to === node) connected.add(branch.from);
    }
  }
  if (!connected.has(reference)) return { kind: "open" };
  if (connected.size > MAX_LC_GRAPH_NETS) throw Error("lc-graph-limit");
  const active = branches.filter(branch => connected.has(branch.from));
  const nodes = [source, ...[...connected].filter(node => node !== source && node !== reference)];
  const rowOf = new Map(nodes.map((node, index) => [node, index]));

  // qY_L = 1000/ticks; qY_C = t*ticks/1_000_000. Clear denominators
  // with a single exact multiplier shared by every matrix entry.
  const weight = active.reduce((common, branch) => branch.kind === "l"
    ? common / gcd(common, branch.ticks) * branch.ticks : common, 1_000_000n);
  const matrix = nodes.map(() => nodes.map<Polynomial>(() => [0n]));
  for (const { from, to, kind, ticks } of active) {
    const branch = kind === "l" ? [1000n * (weight / ticks)] : [0n, ticks * (weight / 1_000_000n)];
    const a = rowOf.get(from);
    const b = rowOf.get(to);
    if (a !== undefined) matrix[a][a] = add(matrix[a][a], branch);
    if (b !== undefined) matrix[b][b] = add(matrix[b][b], branch);
    if (a !== undefined && b !== undefined) {
      matrix[a][b] = add(matrix[a][b], scale(branch, -1n));
      matrix[b][a] = matrix[a][b];
    }
  }

  const atQ = (polynomial: Polynomial): Polynomial =>
    polynomial.flatMap((coefficient, i) => i ? [0n, coefficient] : [coefficient]);
  const minor = determinant(matrix.slice(1).map(row => row.slice(1)));
  const impedance = reduce(shift(scale(atQ(minor), weight), 1), atQ(determinant(matrix)));
  return { kind: "finite", impedance, nodeCount: connected.size };
}
