import {
  addComplex, complexArgumentDegrees, complexFromPolar, complexMagnitude, divideComplex, multiplyComplex, subtractComplex,
  type Complex,
} from "../models/circular-diagram";
import type { PowerConfiguration } from "./configuration";
import { configuredLineEquivalent } from "./line-equivalent";
import type { PowerCalculationCut, PowerSource } from "./network";
import { solvePreliminaryRing, type RingBranch, type RingMethod } from "./ring-preliminary";

const zero: Complex = { re: 0, im: 0 };
const sqrt3 = Math.sqrt(3);
const scale = (v: Complex, n: number): Complex => ({ re: v.re * n, im: v.im * n });
const conj = ({ re, im }: Complex): Complex => ({ re, im: -im });
const multiplyPower = (voltage: Complex, current: Complex): Complex => scale(multiplyComplex(voltage, conj(current)), 3);
const sum = (values: readonly Complex[]) => values.reduce(addComplex, zero);
const finite = (value: Complex) => Number.isFinite(complexMagnitude(value));

type Line = RingBranch & { shunt: Complex };
type PathBranch = { line: Line; from: string; to: string; reverse: boolean };
type PathState = { branches: readonly PathBranch[]; baseCurrents: readonly Complex[]; impedance: Complex; drop: Complex };

export type RefinedRing = Readonly<{
  referenceBusId: string; cutBusId: string; iterations: number; voltageResidualPu: number; powerBalanceErrorMva: number;
  leftDeliveryMva: Complex; rightDeliveryMva: Complex; sourceMva: Complex; totalAbsorptionMva: Complex;
  nodes: readonly { busId: string; voltageKv: number; angleDeg: number }[];
  branches: readonly { id: string; fromBusId: string; toBusId: string; sendingMva: Complex; receivingMva: Complex;
    seriesLossMva: Complex; totalAbsorptionMva: Complex; currentKa: number }[];
}>;

function pathState(branches: readonly PathBranch[], draws: ReadonlyMap<string, Complex>): PathState {
  const baseCurrents = Array<Complex>(branches.length);
  let cumulative = zero;
  for (let i = branches.length - 1; i >= 0; i--) {
    baseCurrents[i] = cumulative;
    cumulative = addComplex(cumulative, draws.get(branches[i].from)!);
  }
  return { branches, baseCurrents,
    impedance: sum(branches.map(branch => branch.line.impedanceOhm)),
    drop: sum(branches.map((branch, i) => multiplyComplex(branch.line.impedanceOhm, baseCurrents[i]))) };
}

function forward(path: PathState, cutShare: Complex, sourceV: Complex) {
  let voltage = sourceV;
  return path.branches.map((branch, i) => {
    const current = addComplex(path.baseCurrents[i], cutShare);
    const next = subtractComplex(voltage, multiplyComplex(branch.line.impedanceOhm, current));
    voltage = next;
    return { ...branch, current, voltage: next };
  });
}

export function refineRingWithLosses(configuration: PowerConfiguration, method: RingMethod,
  cuts: readonly PowerCalculationCut[], options: { maxIterations?: number; tolerancePu?: number } = {}): RefinedRing {
  const { maxIterations = 100, tolerancePu = 1e-9 } = options;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 300 ||
      !Number.isFinite(tolerancePu) || tolerancePu < 1e-12 || tolerancePu > 1e-4) throw Error("power-ring-refinement-options");
  const preliminary = solvePreliminaryRing(configuration, method, cuts);
  const { referenceBusId } = preliminary;
  const source = configuration.network.elements.find(
    (item): item is PowerSource => item.kind === "source" && item.inService && item.busId === referenceBusId)!;
  const branches = preliminary.branches.map(line => ({ ...line, shunt: configuredLineEquivalent(configuration, line.id).shuntPerEndSiemens }));
  const cutBusId = cuts.find(cut => cut.quantity === "p")?.busId ?? cuts.find(cut => cut.quantity === "q")?.busId ??
    preliminary.split.p[0] ?? preliminary.split.q[0] ?? branches[Math.floor(branches.length / 2) - 1].toBusId;
  const pivot = branches.findIndex(branch => branch.toBusId === cutBusId) + 1;
  const left = branches.slice(0, pivot).map(line => ({ line, from: line.fromBusId, to: line.toBusId, reverse: false }));
  const right = branches.slice(pivot).reverse().map(line => ({ line, from: line.toBusId, to: line.fromBusId, reverse: true }));
  const nominalKv = configuration.network.buses.find(bus => bus.id === referenceBusId)!.nominalKv;
  const sourceV = complexFromPolar(source.voltageKv / sqrt3, source.angleDeg % 360);
  const demand = new Map(branches.map(branch => [branch.fromBusId, zero]));
  const shunts = new Map(demand);
  for (const element of configuration.network.elements) {
    if (element.kind !== "load" || !element.inService || !demand.has(element.busId)) continue;
    demand.set(element.busId, addComplex(demand.get(element.busId)!, { re: element.activeMw, im: element.reactiveMvar }));
  }
  for (const line of branches) {
    shunts.set(line.fromBusId, addComplex(shunts.get(line.fromBusId)!, line.shunt));
    shunts.set(line.toBusId, addComplex(shunts.get(line.toBusId)!, line.shunt));
  }
  const voltages = new Map([[referenceBusId, sourceV]]);
  for (const branch of branches) {
    if (branch.toBusId === referenceBusId) continue;
    const preliminaryCurrent = conj(divideComplex(scale(branch.preliminaryMva, 1 / 3), sourceV));
    voltages.set(branch.toBusId, subtractComplex(
      voltages.get(branch.fromBusId)!, multiplyComplex(branch.impedanceOhm, preliminaryCurrent)));
  }

  function pass() {
    const draws = new Map([...demand].map(([busId, load]) => {
      const voltage = voltages.get(busId)!;
      if (!finite(voltage) || complexMagnitude(voltage) < nominalKv * 1e-8 / sqrt3) throw Error("power-ring-refinement-convergence");
      return [busId, addComplex(conj(divideComplex(scale(load, 1 / 3), voltage)), multiplyComplex(shunts.get(busId)!, voltage))];
    }));
    const a = pathState(left, draws);
    const b = pathState(right, draws);
    const cutDraw = draws.get(cutBusId)!;
    const leftShare = divideComplex(
      addComplex(subtractComplex(b.drop, a.drop), multiplyComplex(b.impedance, cutDraw)), addComplex(a.impedance, b.impedance));
    const rightShare = subtractComplex(cutDraw, leftShare);
    const leftValues = forward(a, leftShare, sourceV);
    const rightValues = forward(b, rightShare, sourceV);
    return { leftValues, rightValues, leftShare, rightShare };
  }

  let voltageResidualPu = Infinity;
  let iterations = 0;
  while (iterations < maxIterations && voltageResidualPu > tolerancePu) {
    const { leftValues, rightValues } = pass();
    const updates = [...leftValues, ...rightValues];
    const closure = complexMagnitude(subtractComplex(leftValues.at(-1)!.voltage, rightValues.at(-1)!.voltage));
    voltageResidualPu = Math.max(closure, ...updates.map(item =>
      complexMagnitude(subtractComplex(item.voltage, voltages.get(item.to)!)))) * sqrt3 / nominalKv;
    if (!Number.isFinite(voltageResidualPu)) throw Error("power-ring-refinement-convergence");
    for (const item of updates) voltages.set(item.to, item.voltage);
    iterations++;
  }
  if (voltageResidualPu > tolerancePu) throw Error("power-ring-refinement-convergence");
  const { leftValues, rightValues, leftShare, rightShare } = pass();
  const currentById = new Map([...leftValues, ...rightValues].map(item => [item.line.id, item.reverse ? scale(item.current, -1) : item.current]));
  const results = branches.map(line => {
    const current = currentById.get(line.id)!;
    const sendingV = voltages.get(line.fromBusId)!;
    const receivingV = voltages.get(line.toBusId)!;
    const sendingMva = multiplyPower(sendingV, addComplex(current, multiplyComplex(line.shunt, sendingV)));
    const receivingMva = multiplyPower(receivingV, subtractComplex(current, multiplyComplex(line.shunt, receivingV)));
    const seriesLossMva = scale(line.impedanceOhm, 3 * complexMagnitude(current) ** 2);
    const totalAbsorptionMva = addComplex(seriesLossMva,
      scale(conj(line.shunt), 3 * (complexMagnitude(sendingV) ** 2 + complexMagnitude(receivingV) ** 2)));
    return { id: line.id, fromBusId: line.fromBusId, toBusId: line.toBusId, sendingMva, receivingMva, seriesLossMva,
      totalAbsorptionMva, currentKa: complexMagnitude(current) };
  });
  const sourceMva = sum([demand.get(referenceBusId)!, results[0].sendingMva, scale(results.at(-1)!.receivingMva, -1)]);
  const totalAbsorptionMva = sum(results.map(result => result.totalAbsorptionMva));
  const powerBalanceErrorMva = complexMagnitude(subtractComplex(sourceMva, addComplex(sum([...demand.values()]), totalAbsorptionMva)));
  if (!Number.isFinite(powerBalanceErrorMva) || powerBalanceErrorMva > Math.max(1, complexMagnitude(sourceMva)) * tolerancePu * 50) {
    throw Error("power-ring-refinement-balance");
  }
  const cutV = voltages.get(cutBusId)!;
  return { referenceBusId, cutBusId, iterations, voltageResidualPu, powerBalanceErrorMva, sourceMva, totalAbsorptionMva,
    leftDeliveryMva: multiplyPower(cutV, leftShare), rightDeliveryMva: multiplyPower(cutV, rightShare), branches: results,
    nodes: [...voltages].map(([busId, value]) => ({ busId, voltageKv: complexMagnitude(value) * sqrt3, angleDeg: complexArgumentDegrees(value) })) };
}
