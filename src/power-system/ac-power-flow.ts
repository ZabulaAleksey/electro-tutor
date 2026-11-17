import {
  addComplex, complexArgumentDegrees, complexFromPolar, complexMagnitude, divideComplex, multiplyComplex, subtractComplex,
  type Complex,
} from "../models/circular-diagram";
import { solvePowerLinearSystem } from "./ac-linear-system";
import type { PowerConfiguration } from "./configuration";
import { type PowerBranch, type PowerIsland, type PowerSource } from "./network";
import { buildPowerBranchModel, type BranchModel } from "./radial-flow";
import { createPowerStudy } from "./topology";

const zero: Complex = { re: 0, im: 0 };
const sqrt3 = Math.sqrt(3);
const scale = (v: Complex, n: number): Complex => ({ re: v.re * n, im: v.im * n });
const conjugate = ({ re, im }: Complex): Complex => ({ re, im: -im });
const jq = ({ re, im }: Complex): Complex => ({ re: -im, im: re });
const consumed = (v: Complex, i: Complex): Complex => scale(multiplyComplex(v, conjugate(i)), 3);
const sum = (values: readonly Complex[]) => values.reduce(addComplex, zero);
const finite = (v: Complex) => Number.isFinite(complexMagnitude(v));

export const maxAcBuses = 64;
export const maxAcElements = 192;

type ACBranchInput = Readonly<{ id: string; ideal: boolean; model: BranchModel }>;
export type ACBus = Readonly<{ busId: string; voltageKv: number; angleDeg: number }>;
export type ACBranch = Readonly<{
  id: string; fromBusId: string; toBusId: string;
  fromCurrentKa: number | null; toCurrentKa: number | null;
  sendingPowerMva: Complex | null; receivingPowerMva: Complex | null;
  seriesLossesMva: Complex; totalAbsorptionMva: Complex;
}>;
export type ACPowerFlow = Readonly<{
  nodes: readonly ACBus[]; branches: readonly ACBranch[];
  sources: readonly { id: string; busId: string; powerMva: Complex }[];
  unpoweredBusIds: readonly string[]; iterations: number; maxMismatchMva: number; powerBalanceErrorMva: number;
}>;

function buildSystem(buses: readonly string[], branches: readonly ACBranchInput[]) {
  const group = new Map(buses.map(busId => [busId, busId]));
  function root(id: string): string {
    let current = id;
    while (group.get(current)! !== current) current = group.get(current)!;
    return current;
  }
  for (const { model, ideal } of branches) {
    if (!ideal) continue;
    if (complexMagnitude(subtractComplex(model.tap, { re: 1, im: 0 })) > 1e-12) throw Error("power-ac-ideal-tap");
    group.set(root(model.to), root(model.from));
  }
  const order = [...new Set(buses.map(root))];
  const index = new Map(order.map((id, at) => [id, at]));
  const busIndex = (id: string) => index.get(root(id))!;
  const ybus = order.map(() => order.map(() => zero));
  const stamp = (row: number, col: number, value: Complex) => { ybus[row][col] = addComplex(ybus[row][col], value); };
  for (const { model, ideal } of branches) {
    const from = busIndex(model.from);
    const to = busIndex(model.to);
    stamp(from, from, model.shuntFrom);
    stamp(to, to, model.shuntTo);
    if (ideal) continue;
    const series = divideComplex({ re: 1, im: 0 }, model.impedance);
    stamp(from, from, series);
    stamp(from, to, scale(multiplyComplex(model.tap, series), -1));
    stamp(to, from, scale(multiplyComplex(conjugate(model.tap), series), -1));
    stamp(to, to, scale(series, complexMagnitude(model.tap) ** 2));
  }
  if (ybus.some(row => row.some(value => !finite(value)))) throw Error("power-ac-admittance-range");
  return { ybus, order, busIndex };
}

function terminalResults(inputs: readonly ACBranchInput[], voltages: ReadonlyMap<string, Complex>,
  initialDraws: ReadonlyMap<string, Complex>) {
  const draws = new Map(initialDraws);
  const seriesById = new Map<string, Complex>();
  const idealAdjacent = new Map([...draws.keys()].map(id => [id, [] as ACBranchInput[]]));
  for (const branch of inputs) {
    const { model } = branch;
    const fromV = voltages.get(model.from)!;
    const toV = voltages.get(model.to)!;
    const fromShunt = multiplyComplex(model.shuntFrom, fromV);
    const toShunt = multiplyComplex(model.shuntTo, toV);
    const series = branch.ideal ? zero : divideComplex(subtractComplex(fromV, multiplyComplex(model.tap, toV)), model.impedance);
    draws.set(model.from, addComplex(draws.get(model.from)!, addComplex(fromShunt, series)));
    draws.set(model.to, addComplex(draws.get(model.to)!, subtractComplex(toShunt, multiplyComplex(conjugate(model.tap), series))));
    if (branch.ideal) {
      idealAdjacent.get(model.from)!.push(branch);
      idealAdjacent.get(model.to)!.push(branch);
    } else {
      seriesById.set(branch.id, series);
    }
  }
  // Each bridge of the ideal-contact subgraph has a unique current given by KCL on its downstream side.
  for (const branch of inputs) {
    if (!branch.ideal) continue;
    const { from, to } = branch.model;
    const side = [to];
    const visited = new Set(side);
    for (const bus of side) {
      for (const other of idealAdjacent.get(bus)!) {
        if (other.id === branch.id) continue;
        const neighbor = other.model.from === bus ? other.model.to : other.model.from;
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        side.push(neighbor);
      }
    }
    if (!visited.has(from)) seriesById.set(branch.id, sum(side.map(id => draws.get(id)!)));
  }
  return inputs.map(({ id, model }) => {
    const fromV = voltages.get(model.from)!;
    const toV = voltages.get(model.to)!;
    const series = seriesById.get(id);
    const fromI = series ? addComplex(series, multiplyComplex(model.shuntFrom, fromV)) : null;
    const toI = series ? subtractComplex(multiplyComplex(conjugate(model.tap), series), multiplyComplex(model.shuntTo, toV)) : null;
    const seriesLossesMva = series ? scale(model.impedance, 3 * complexMagnitude(series) ** 2) : zero;
    const totalAbsorptionMva = sum([seriesLossesMva, scale(conjugate(model.shuntFrom), 3 * complexMagnitude(fromV) ** 2),
      scale(conjugate(model.shuntTo), 3 * complexMagnitude(toV) ** 2)]);
    return { id, fromBusId: model.from, toBusId: model.to, fromCurrentKa: fromI && complexMagnitude(fromI),
      toCurrentKa: toI && complexMagnitude(toI), sendingPowerMva: fromI && consumed(fromV, fromI),
      receivingPowerMva: toI && consumed(toV, toI), seriesLossesMva, totalAbsorptionMva };
  });
}

function solveIsland(configuration: PowerConfiguration, island: PowerIsland, maxIterations: number, toleranceMva: number) {
  if (island.sourceIds.length !== 1) throw Error("power-ac-reference-count");
  const byId = new Map(configuration.network.elements.map(item => [item.id, item]));
  const source = byId.get(island.sourceIds[0]) as PowerSource;
  const inputs = island.branchIds.map(id => {
    const branch = byId.get(id) as PowerBranch;
    const model = buildPowerBranchModel(configuration, branch);
    return { id, model, ideal: complexMagnitude(model.impedance) === 0 };
  });
  const { ybus, order, busIndex } = buildSystem(island.busIds, inputs);
  const ref = busIndex(source.busId);
  const unknown = order.map((_, index) => index).filter(index => index !== ref);
  const basesKv = new Map(configuration.network.buses.map(bus => [bus.id, bus.nominalKv / sqrt3]));
  const bases = order.map(busId => basesKv.get(busId)!);
  const loadByBus = new Map(island.busIds.map(id => [id, zero]));
  for (const id of island.loadIds) {
    const load = byId.get(id);
    if (load?.kind !== "load") continue;
    loadByBus.set(load.busId, addComplex(loadByBus.get(load.busId)!, { re: load.activeMw, im: load.reactiveMvar }));
  }
  const groupLoads = order.map(() => zero);
  for (const [busId, load] of loadByBus) {
    const index = busIndex(busId);
    groupLoads[index] = addComplex(groupLoads[index], load);
  }
  let voltages = bases.map(base => complexFromPolar(base, source.angleDeg % 360));
  voltages[ref] = complexFromPolar(source.voltageKv / sqrt3, source.angleDeg % 360);
  // Propagate no-load ratios from the fixed source to avoid a poor start across voltage levels.
  const adjacency = order.map(() => [] as { neighbor: number; ratio: Complex }[]);
  for (const { model } of inputs) {
    const from = busIndex(model.from);
    const to = busIndex(model.to);
    if (from === to) continue;
    adjacency[from].push({ neighbor: to, ratio: divideComplex({ re: 1, im: 0 }, model.tap) });
    adjacency[to].push({ neighbor: from, ratio: model.tap });
  }
  const pending = [ref];
  const visited = new Set(pending);
  for (const from of pending) {
    for (const { neighbor, ratio } of adjacency[from]) {
      if (visited.has(neighbor)) continue;
      voltages[neighbor] = multiplyComplex(voltages[from], ratio);
      visited.add(neighbor);
      pending.push(neighbor);
    }
  }
  function evaluate(values: readonly Complex[]) {
    const currents = ybus.map(row => sum(row.map((y, i) => multiplyComplex(y, values[i]))));
    const mismatches = unknown.map(i => addComplex(consumed(values[i], currents[i]), groupLoads[i]));
    const residual = Math.max(0, ...mismatches.map(complexMagnitude));
    return { currents, mismatches, residual };
  }
  let solution = evaluate(voltages);
  const bound = toleranceMva * Math.max(1, ...groupLoads.map(complexMagnitude));
  let iterations = 0;
  while (iterations < maxIterations && solution.residual > bound) {
    const jacobian = unknown.flatMap(i => {
      const derivatives = unknown.map(k => {
        const diagonal = i === k ? conjugate(solution.currents[i]) : zero;
        const term = multiplyComplex(voltages[i], conjugate(ybus[i][k]));
        return { x: scale(addComplex(diagonal, term), 3 * bases[k]),
          y: scale(jq(subtractComplex(diagonal, term)), 3 * bases[k]) };
      });
      return [derivatives.flatMap(d => [d.x.re, d.y.re]), derivatives.flatMap(d => [d.x.im, d.y.im])];
    });
    const delta = solvePowerLinearSystem(jacobian, solution.mismatches.flatMap(value => [-value.re, -value.im]));
    let improved = false;
    for (let fraction = 1; fraction >= 1 / 256; fraction /= 2) {
      const trial = [...voltages];
      unknown.forEach((i, k) => {
        trial[i] = addComplex(voltages[i], scale({ re: delta[2 * k], im: delta[2 * k + 1] }, fraction * bases[i]));
      });
      if (!trial.every((value, i) => complexMagnitude(value) > bases[i] * 1e-6)) continue;
      const trialSolution = evaluate(trial);
      if (trialSolution.residual >= solution.residual || !Number.isFinite(trialSolution.residual)) continue;
      voltages = trial;
      solution = trialSolution;
      improved = true;
      break;
    }
    if (!improved) throw Error("power-ac-nonconvergence");
    iterations++;
  }
  if (!Number.isFinite(solution.residual) || solution.residual > bound) throw Error("power-ac-nonconvergence");

  const sourceMva = addComplex(consumed(voltages[ref], solution.currents[ref]), groupLoads[ref]);
  const physicalV = new Map(island.busIds.map(busId => [busId, voltages[busIndex(busId)]]));
  const consumedCurrents = new Map([...loadByBus].map(([busId, load]) => [busId, conjugate(divideComplex(
    scale(busId === source.busId ? subtractComplex(load, sourceMva) : load, 1 / 3), physicalV.get(busId)!))]));
  const branches = terminalResults(inputs, physicalV, consumedCurrents);
  const powerBalanceErrorMva = complexMagnitude(subtractComplex(sourceMva,
    addComplex(sum(groupLoads), sum(branches.map(branch => branch.totalAbsorptionMva)))));
  if (!finite(sourceMva) || !Number.isFinite(powerBalanceErrorMva) || powerBalanceErrorMva > bound * Math.max(20, order.length * 2)) throw Error("power-ac-balance");
  const nodes = [...physicalV].map(([busId, v]) => ({ busId, voltageKv: complexMagnitude(v) * sqrt3, angleDeg: complexArgumentDegrees(v) }));
  return { nodes, branches, source: { id: source.id, busId: source.busId, powerMva: sourceMva },
    iterations, maxMismatchMva: solution.residual, powerBalanceErrorMva };
}

export function solveACPowerFlow(configuration: PowerConfiguration,
  options: { maxIterations?: number; toleranceMva?: number } = {}): ACPowerFlow {
  const { maxIterations = 40, toleranceMva = 1e-9 } = options;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 100 ||
      !Number.isFinite(toleranceMva) || toleranceMva < 1e-12 || toleranceMva > 1e-4) throw Error("power-ac-options");
  if (configuration.network.buses.length > maxAcBuses || configuration.network.elements.length > maxAcElements) throw Error("power-ac-network-limit");
  const study = createPowerStudy(configuration.network);
  const powered = study.islands.filter(island => island.energized);
  if (!powered.length) throw Error("power-ac-source-required");
  const islands = powered.map(island => solveIsland(configuration, island, maxIterations, toleranceMva));
  return { nodes: islands.flatMap(island => island.nodes), branches: islands.flatMap(island => island.branches),
    sources: islands.map(island => island.source), unpoweredBusIds: study.islands.filter(island => !island.energized).flatMap(island => island.busIds),
    iterations: Math.max(...islands.map(island => island.iterations)),
    maxMismatchMva: Math.max(...islands.map(island => island.maxMismatchMva)),
    powerBalanceErrorMva: Math.max(...islands.map(island => island.powerBalanceErrorMva)) };
}
