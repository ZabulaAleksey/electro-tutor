import { complexMagnitude } from "../models/circular-diagram";
import type { ACPowerFlow } from "./ac-power-flow";
import { resolveEffectivePowerType, type PowerConfiguration } from "./configuration";

export const teachingVoltageLimitsPu = { low: .95, high: 1.05 } as const;
export type PowerOverlayLayer = "voltage" | "angle" | "active" | "reactive" | "current" | "losses" | "loading" | "warnings";
export const defaultPowerOverlayLayers: readonly PowerOverlayLayer[] = ["voltage", "active", "warnings"];

export function calculateOverlayReadings(configuration: PowerConfiguration, flow: ACPowerFlow) {
  const physical = new Map(configuration.network.elements.map(device => [device.id, device]));
  const nominal = new Map(configuration.network.buses.map(bus => [bus.id, bus.nominalKv]));
  const nodes = flow.nodes.map(bus => {
    const pu = bus.voltageKv / nominal.get(bus.busId)!;
    return { ...bus, pu, outOfRange: pu < teachingVoltageLimitsPu.low || pu > teachingVoltageLimitsPu.high };
  });
  const branches = flow.branches.map(branch => {
    const device = physical.get(branch.id);
    let loadingPercent: number | null = null;
    if (device?.kind === "line" && branch.fromCurrentKa !== null && branch.toCurrentKa !== null) {
      const type = resolveEffectivePowerType(configuration, device.id);
      if (type?.kind === "line" && type.maxCurrentA && type.maxCurrentA > 0) {
        loadingPercent = 100 * Math.max(branch.fromCurrentKa, branch.toCurrentKa) * 1000 / (device.parallelCircuits * type.maxCurrentA);
      }
    }
    if (device?.kind === "transformer" && branch.sendingPowerMva && branch.receivingPowerMva) {
      const type = resolveEffectivePowerType(configuration, device.id);
      if (type?.kind === "transformer") {
        loadingPercent = 100 * Math.max(complexMagnitude(branch.sendingPowerMva), complexMagnitude(branch.receivingPowerMva)) /
          (device.parallelUnits * type.ratedMva);
      }
    }
    return { ...branch, loadingPercent, overloaded: loadingPercent !== null && loadingPercent > 100 };
  });
  return { nodes, branches, unpowered: new Set(flow.unpoweredBusIds) };
}
export type PowerOverlayReadings = ReturnType<typeof calculateOverlayReadings>;
