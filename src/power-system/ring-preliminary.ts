import {
  addComplex, complexMagnitude, divideComplex, multiplyComplex, subtractComplex, type Complex,
} from "../models/circular-diagram";
import type { PowerConfiguration } from "./configuration";
import { configuredLineEquivalent } from "./line-equivalent";
import { type PowerCalculationCut, type PowerLine, type PowerSource } from "./network";
import { createPowerStudy } from "./topology";

const zero: Complex = { re: 0, im: 0 };
const sum = (values: readonly Complex[]) => values.reduce(addComplex, zero);
const conj = ({ re, im }: Complex): Complex => ({ re, im: -im });

export type RingMethod = "lengths" | "impedances";
export type RingBranch = Readonly<{
  id: string; fromBusId: string; toBusId: string; lengthKm: number; impedanceOhm: Complex; preliminaryMva: Complex;
}>;
export type PreliminaryRingFlow = Readonly<{
  method: RingMethod; referenceBusId: string; branches: readonly RingBranch[]; totalLoadMva: Complex;
  split: Readonly<{ p: readonly string[]; q: readonly string[] }>; calculationCuts: readonly PowerCalculationCut[];
}>;

type OrderedRingLine = Omit<RingBranch, "preliminaryMva">;

function splittingBuses(branches: readonly RingBranch[], part: "re" | "im"): string[] {
  const epsilon = Math.max(1, ...branches.map(value => Math.abs(value.preliminaryMva[part]))) * 1e-10;
  const splits: string[] = [];
  for (let before = 0; before < branches.length - 1; before++) {
    if (branches[before].preliminaryMva[part] <= epsilon) continue;
    let after = before + 1;
    while (after < branches.length && Math.abs(branches[after].preliminaryMva[part]) <= epsilon) after++;
    if (after === branches.length || branches[after].preliminaryMva[part] >= -epsilon) continue;
    for (let index = before; index < after; index++) splits.push(branches[index].toBusId);
  }
  return splits;
}

export function solvePreliminaryRing(configuration: PowerConfiguration, method: RingMethod,
  calculationCuts: readonly PowerCalculationCut[] = []): PreliminaryRingFlow {
  const study = createPowerStudy(configuration.network, calculationCuts);
  const powered = study.islands.filter(island => island.energized);
  if (powered.length !== 1 || powered[0].sourceIds.length !== 1) throw Error("power-ring-source-count");
  const [island] = powered;
  if (island.busIds.length < 3 || island.branchIds.length !== island.busIds.length) throw Error("power-ring-simple-cycle");
  const byId = new Map(study.physical.elements.map(item => [item.id, item]));
  const source = byId.get(island.sourceIds[0]) as PowerSource;
  if (new Set(study.physical.buses.filter(bus => island.busIds.includes(bus.id)).map(bus => bus.nominalKv)).size !== 1) {
    throw Error("power-ring-uniform-voltage");
  }
  const referenceBusId = source.busId;
  if (study.calculationCuts.some(cut => cut.busId === referenceBusId || !island.busIds.includes(cut.busId))) {
    throw Error("power-ring-cut-bus");
  }
  const loadAt = new Map(island.busIds.map(id => [id, zero]));
  for (const id of island.loadIds) {
    const load = byId.get(id);
    if (load?.kind !== "load") continue;
    loadAt.set(load.busId, addComplex(loadAt.get(load.busId)!, { re: load.activeMw, im: load.reactiveMvar }));
  }

  const adjacency = new Map(island.busIds.map(id => [id, [] as PowerLine[]]));
  for (const id of island.branchIds) {
    const branch = byId.get(id);
    if (branch?.kind !== "line") throw Error("power-ring-line-branches");
    adjacency.get(branch.fromBusId)!.push(branch);
    adjacency.get(branch.toBusId)!.push(branch);
  }
  if ([...adjacency.values()].some(lines => lines.length !== 2)) throw Error("power-ring-simple-cycle");
  const lines: OrderedRingLine[] = [];
  let fromBusId = referenceBusId;
  let previousId: string | undefined;
  for (let i = 0; i < island.branchIds.length; i++) {
    const next = adjacency.get(fromBusId)!.find(line => line.id !== previousId)!;
    const toBusId = next.fromBusId === fromBusId ? next.toBusId : next.fromBusId;
    let series: Complex;
    try { series = configuredLineEquivalent(configuration, next.id).seriesOhm; }
    catch (error) { throw Error("power-ring-branch-parameters:" + next.id, { cause: error }); }
    lines.push({ id: next.id, fromBusId, toBusId, lengthKm: next.lengthKm, impedanceOhm: series });
    previousId = next.id;
    fromBusId = toBusId;
  }
  if (fromBusId !== referenceBusId || new Set(lines.map(line => line.id)).size !== island.branchIds.length) {
    throw Error("power-ring-simple-cycle");
  }
  const weights = lines.map(line => method === "lengths" ? { re: line.lengthKm, im: 0 } : line.impedanceOhm);
  const totalWeight = sum(weights);
  if (!Number.isFinite(complexMagnitude(totalWeight)) || complexMagnitude(totalWeight) === 0) throw Error("power-ring-impedance");
  if (method === "lengths") {
    const unit = divideComplex(sum(lines.map(line => line.impedanceOhm)), totalWeight);
    const homogeneous = lines.every(line => complexMagnitude(subtractComplex(
      divideComplex(line.impedanceOhm, { re: line.lengthKm, im: 0 }), unit)) <= 1e-8 * Math.max(complexMagnitude(unit), 1e-9));
    if (!homogeneous || complexMagnitude(unit) === 0) throw Error("power-ring-inhomogeneous");
  }

  let downstream = zero;
  let first = zero;
  for (let i = lines.length - 1; i > 0; i--) {
    downstream = addComplex(downstream, weights[i]);
    const proportion = conj(divideComplex(downstream, totalWeight));
    first = addComplex(first, multiplyComplex(loadAt.get(lines[i].fromBusId)!, proportion));
  }
  let flow = first;
  const branches = lines.map(line => {
    const branch = { ...line, preliminaryMva: flow };
    if (line.toBusId !== referenceBusId) flow = subtractComplex(flow, loadAt.get(line.toBusId)!);
    return branch;
  });
  const totalLoadMva = sum([...loadAt.values()]);
  if (![totalLoadMva, ...branches.map(branch => branch.preliminaryMva)].every(value => Number.isFinite(complexMagnitude(value)))) {
    throw Error("power-ring-overflow");
  }
  return { method, referenceBusId, branches, totalLoadMva, split: { p: splittingBuses(branches, "re"), q: splittingBuses(branches, "im") },
    calculationCuts: study.calculationCuts };
}
