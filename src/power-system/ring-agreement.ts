import { solveACPowerFlow, type ACPowerFlow } from "./ac-power-flow";
import type { PowerConfiguration } from "./configuration";
import type { PowerCalculationCut } from "./network";
import type { RingMethod } from "./ring-preliminary";
import { refineRingWithLosses, type RefinedRing } from "./ring-refinement";

export const ringAgreementTolerances = { voltageKv: .001, angleDeg: .001, activeMw: .001, reactiveMvar: .001 } as const;
type Deviations = Record<keyof typeof ringAgreementTolerances, number>;

type RingAgreement = Readonly<{
  pass: boolean; maximum: Readonly<Deviations>; mismatchedIds: readonly string[];
}>;

function angleDifference(a: number, b: number): number {
  const difference = Math.abs((a - b) % 360);
  return Math.min(difference, 360 - difference);
}

export function assessRingAgreement(ring: RefinedRing, ac: ACPowerFlow): RingAgreement {
  const maximum: Deviations = { voltageKv: 0, angleDeg: 0, activeMw: 0, reactiveMvar: 0 };
  const mismatched = new Set<string>();
  const tolerances = ringAgreementTolerances;
  function compare(id: string, metric: keyof Deviations, difference: number) {
    maximum[metric] = Math.max(maximum[metric], difference);
    if (!Number.isFinite(difference) || difference > tolerances[metric]) mismatched.add(id);
  }
  function comparePower(id: string, first: { re: number; im: number }, second: { re: number; im: number }) {
    compare(id, "activeMw", Math.abs(first.re - second.re));
    compare(id, "reactiveMvar", Math.abs(first.im - second.im));
  }

  const acBus = new Map(ac.nodes.map(bus => [bus.busId, bus]));
  const acBranch = new Map(ac.branches.map(branch => [branch.id, branch]));
  for (const node of ring.nodes) {
    const peer = acBus.get(node.busId);
    if (!peer) { mismatched.add(node.busId); continue; }
    acBus.delete(node.busId);
    compare(node.busId, "voltageKv", Math.abs(node.voltageKv - peer.voltageKv));
    compare(node.busId, "angleDeg", angleDifference(node.angleDeg, peer.angleDeg));
  }
  for (const branch of ring.branches) {
    const peer = acBranch.get(branch.id);
    if (!peer?.sendingPowerMva || !peer.receivingPowerMva) { mismatched.add(branch.id); continue; }
    acBranch.delete(branch.id);
    if (peer.fromBusId === branch.fromBusId && peer.toBusId === branch.toBusId) {
      comparePower(branch.id, branch.sendingMva, peer.sendingPowerMva);
      comparePower(branch.id, branch.receivingMva, peer.receivingPowerMva);
    } else if (peer.fromBusId === branch.toBusId && peer.toBusId === branch.fromBusId) {
      comparePower(branch.id, branch.sendingMva, { re: -peer.receivingPowerMva.re, im: -peer.receivingPowerMva.im });
      comparePower(branch.id, branch.receivingMva, { re: -peer.sendingPowerMva.re, im: -peer.sendingPowerMva.im });
    } else {
      mismatched.add(branch.id);
    }
    comparePower(branch.id, branch.seriesLossMva, peer.seriesLossesMva);
    comparePower(branch.id, branch.totalAbsorptionMva, peer.totalAbsorptionMva);
  }
  for (const id of [...acBus.keys(), ...acBranch.keys()]) mismatched.add(id);
  const reference = ac.sources.find(source => source.busId === ring.referenceBusId);
  if (reference) comparePower(ring.referenceBusId, ring.sourceMva, reference.powerMva);
  else mismatched.add(ring.referenceBusId);
  return { pass: !mismatched.size, maximum, mismatchedIds: [...mismatched] };
}

export function compareRingSolvers(configuration: PowerConfiguration, method: RingMethod,
  cuts: readonly PowerCalculationCut[] = []): RingAgreement {
  return assessRingAgreement(refineRingWithLosses(configuration, method, cuts), solveACPowerFlow(configuration));
}
