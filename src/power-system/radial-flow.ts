import {
  addComplex, complexArgumentDegrees, complexFromPolar, complexMagnitude, divideComplex, multiplyComplex, subtractComplex,
  type Complex,
} from "../models/circular-diagram";
import type { PowerConfiguration } from "./configuration";
import { configuredLineEquivalent } from "./line-equivalent";
import { powerBranchEndpoints, type PowerBranch, type PowerSource } from "./network";
import { createPowerStudy } from "./topology";
import { configuredTransformerEquivalent } from "./transformer-equivalent";

const zero: Complex = { re: 0, im: 0 };
const one: Complex = { re: 1, im: 0 };
const phases = Math.sqrt(3);
const scale = (value: Complex, by: number): Complex => ({ re: value.re * by, im: value.im * by });
const conjugate = ({ re, im }: Complex): Complex => ({ re, im: -im });
const power = (voltage: Complex, current: Complex): Complex => scale(multiplyComplex(voltage, conjugate(current)), 3);
const finite = ({ re, im }: Complex): boolean => Number.isFinite(re) && Number.isFinite(im);

type BranchModel = Readonly<{
  from: string; to: string; impedance: Complex; tap: Complex; shuntFrom: Complex; shuntTo: Complex;
}>;
type OrientedBranch = Readonly<{ id: string; parent: string; child: string; reverse: boolean; model: BranchModel;
  ratio: Complex; transfer: Complex; childImpedance: Complex }>;

export type RadialFlowNode = Readonly<{ busId: string; voltageKv: number; angleDeg: number; loadMva: Complex }>;
export type RadialFlowBranch = Readonly<{
  id: string; fromBusId: string; toBusId: string; fromCurrentKa: number; toCurrentKa: number;
  sendingPowerMva: Complex; receivingPowerMva: Complex; seriesLossesMva: Complex; totalAbsorptionMva: Complex;
}>;
export type RadialFlowResult = Readonly<{
  referenceBusId: string; nodes: readonly RadialFlowNode[]; branches: readonly RadialFlowBranch[];
  unpoweredBusIds: readonly string[]; sourceMva: Complex; totalLoadMva: Complex; totalAbsorptionMva: Complex;
  iterations: number; voltageResidualPu: number; powerBalanceErrorMva: number;
}>;

function branchModel(configuration: PowerConfiguration, branch: PowerBranch): BranchModel {
  const [from, to] = powerBranchEndpoints(branch);
  if (branch.kind === "switch") return { from, to, impedance: zero, tap: one, shuntFrom: zero, shuntTo: zero };
  try {
    if (branch.kind === "line") {
      const equivalent = configuredLineEquivalent(configuration, branch.id);
      return { from, to, impedance: equivalent.seriesOhm, tap: one,
        shuntFrom: equivalent.shuntPerEndSiemens, shuntTo: equivalent.shuntPerEndSiemens };
    }
    const equivalent = configuredTransformerEquivalent(configuration, branch.id);
    return { from, to, impedance: equivalent.seriesOhm,
      tap: complexFromPolar(equivalent.tapRatioHvSide, -equivalent.phaseShiftDeg), shuntFrom: equivalent.shuntSiemens, shuntTo: zero };
  } catch (error) {
    throw Error("power-flow-branch-parameters:" + branch.id, { cause: error });
  }
}

function orientBranch(id: string, model: BranchModel, parent: string): OrientedBranch {
  const reverse = model.to === parent;
  const child = reverse ? model.from : model.to;
  const ratio = reverse ? divideComplex(one, model.tap) : model.tap;
  const transfer = reverse ? conjugate(model.tap) : divideComplex(one, conjugate(model.tap));
  const childImpedance = reverse ? model.impedance : scale(model.impedance, complexMagnitude(transfer) ** 2);
  if (![ratio, transfer, childImpedance].every(finite)) throw Error("power-flow-branch-parameters:" + id);
  return { id, parent, child, reverse, model, ratio, transfer, childImpedance };
}

function finishBranch(branch: OrientedBranch, volts: ReadonlyMap<string, Complex>, currents: ReadonlyMap<string, Complex>): RadialFlowBranch {
  const { model, child, reverse } = branch;
  const fromV = volts.get(model.from)!;
  const toV = volts.get(model.to)!;
  const childI = currents.get(child)!;
  const seriesFrom = reverse ? scale(childI, -1) : multiplyComplex(childI, branch.transfer);
  const seriesTo = multiplyComplex(conjugate(model.tap), seriesFrom);
  const fromI = addComplex(seriesFrom, multiplyComplex(model.shuntFrom, fromV));
  const toI = subtractComplex(seriesTo, multiplyComplex(model.shuntTo, toV));
  const sendingPowerMva = power(fromV, fromI);
  const receivingPowerMva = power(toV, toI);
  const seriesLossesMva = scale(model.impedance, 3 * complexMagnitude(seriesFrom) ** 2);
  const totalAbsorptionMva = addComplex(seriesLossesMva,
    addComplex(scale(conjugate(model.shuntFrom), 3 * complexMagnitude(fromV) ** 2),
      scale(conjugate(model.shuntTo), 3 * complexMagnitude(toV) ** 2)));
  return { id: branch.id, fromBusId: model.from, toBusId: model.to, fromCurrentKa: complexMagnitude(fromI),
    toCurrentKa: complexMagnitude(toI), sendingPowerMva, receivingPowerMva, seriesLossesMva, totalAbsorptionMva };
}

export function solveRadialFlow(configuration: PowerConfiguration, options: { maxIterations?: number; tolerancePu?: number } = {}): RadialFlowResult {
  const { maxIterations = 100, tolerancePu = 1e-9 } = options;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 300 ||
      !Number.isFinite(tolerancePu) || tolerancePu < 1e-12 || tolerancePu > 1e-4) throw Error("power-flow-options");
  const study = createPowerStudy(configuration.network);
  const powered = study.islands.filter(island => island.energized);
  if (powered.length !== 1 || powered[0].sourceIds.length !== 1) throw Error("power-flow-source-count");
  const [island] = powered;
  if (island.topology === "meshed") throw Error("power-flow-mesh");
  const byId = new Map(study.physical.elements.map(element => [element.id, element]));
  const source = byId.get(island.sourceIds[0]) as PowerSource;
  const referenceBusId = source.busId;
  const volts = new Map([[referenceBusId, complexFromPolar(source.voltageKv / phases, source.angleDeg % 360)]]);
  const adjacency = new Map(island.busIds.map(id => [id, [] as { id: string; model: BranchModel }[]]));
  const shunts = new Map(island.busIds.map(id => [id, zero]));
  const loads = new Map(island.busIds.map(id => [id, zero]));
  const nominalKv = new Map(study.physical.buses.map(bus => [bus.id, bus.nominalKv]));
  for (const id of island.branchIds) {
    const model = branchModel(configuration, byId.get(id) as PowerBranch);
    adjacency.get(model.from)!.push({ id, model });
    adjacency.get(model.to)!.push({ id, model });
    shunts.set(model.from, addComplex(shunts.get(model.from)!, model.shuntFrom));
    shunts.set(model.to, addComplex(shunts.get(model.to)!, model.shuntTo));
  }
  for (const id of island.loadIds) {
    const load = byId.get(id);
    if (load?.kind !== "load") continue;
    loads.set(load.busId, addComplex(loads.get(load.busId)!, { re: load.activeMw, im: load.reactiveMvar }));
  }
  const order = [referenceBusId];
  const oriented: OrientedBranch[] = [];
  for (const parent of order) {
    for (const { id, model } of adjacency.get(parent)!) {
      const branch = orientBranch(id, model, parent);
      if (volts.has(branch.child)) continue;
      oriented.push(branch);
      order.push(branch.child);
      volts.set(branch.child, divideComplex(volts.get(parent)!, branch.ratio));
    }
  }

  function backwardSweep(): Map<string, Complex> {
    const powers = new Map(order.map(id => {
      const voltage = volts.get(id)!;
      if (!finite(voltage) || complexMagnitude(voltage) < nominalKv.get(id)! * 1e-8 / phases) {
        throw Error("power-flow-nonconvergence");
      }
      return [id, addComplex(loads.get(id)!, scale(conjugate(shunts.get(id)!), 3 * complexMagnitude(voltage) ** 2))];
    }));
    const currents = new Map<string, Complex>();
    for (let i = oriented.length - 1; i >= 0; i--) {
      const { child, parent, childImpedance } = oriented[i];
      const childPower = powers.get(child)!;
      const current = conjugate(divideComplex(scale(childPower, 1 / 3), volts.get(child)!));
      if (!finite(current)) throw Error("power-flow-nonconvergence");
      currents.set(child, current);
      const loss = scale(childImpedance, 3 * complexMagnitude(current) ** 2);
      powers.set(parent, addComplex(powers.get(parent)!, addComplex(childPower, loss)));
    }
    return currents;
  }

  let voltageResidualPu = Infinity;
  let iterations = 0;
  while (iterations < maxIterations && voltageResidualPu > tolerancePu) {
    const currents = backwardSweep();
    voltageResidualPu = 0;
    for (const { child, parent, ratio, childImpedance } of oriented) {
      const next = subtractComplex(divideComplex(volts.get(parent)!, ratio), multiplyComplex(childImpedance, currents.get(child)!));
      if (!finite(next)) throw Error("power-flow-nonconvergence");
      voltageResidualPu = Math.max(voltageResidualPu, complexMagnitude(subtractComplex(next, volts.get(child)!)) * phases / nominalKv.get(child)!);
      volts.set(child, next);
    }
    iterations++;
  }
  if (voltageResidualPu > tolerancePu) throw Error("power-flow-nonconvergence");
  const currents = backwardSweep();
  const nodes = order.map(busId => ({ busId, voltageKv: complexMagnitude(volts.get(busId)!) * phases,
    angleDeg: complexArgumentDegrees(volts.get(busId)!), loadMva: loads.get(busId)! }));
  const branches = oriented.map(branch => finishBranch(branch, volts, currents));
  let sourceMva = loads.get(referenceBusId)!;
  for (const branch of branches) {
    if (branch.fromBusId === referenceBusId) sourceMva = addComplex(sourceMva, branch.sendingPowerMva);
    if (branch.toBusId === referenceBusId) sourceMva = subtractComplex(sourceMva, branch.receivingPowerMva);
  }
  const totalLoadMva = nodes.map(node => node.loadMva).reduce(addComplex, zero);
  const totalAbsorptionMva = branches.map(branch => branch.totalAbsorptionMva).reduce(addComplex, zero);
  const powerBalanceErrorMva = complexMagnitude(subtractComplex(sourceMva, addComplex(totalLoadMva, totalAbsorptionMva)));
  if (!Number.isFinite(powerBalanceErrorMva) || powerBalanceErrorMva > Math.max(1, complexMagnitude(sourceMva)) * tolerancePu * 50) {
    throw Error("power-flow-balance");
  }
  return { referenceBusId, nodes, branches, unpoweredBusIds: study.islands.filter(other => !other.energized).flatMap(other => other.busIds),
    sourceMva, totalLoadMva, totalAbsorptionMva, iterations, voltageResidualPu, powerBalanceErrorMva };
}
