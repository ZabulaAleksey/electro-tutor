import type { Complex } from "../models/circular-diagram";
import type { LineType } from "./catalogue";
import { powerEquipment, resolveEffectivePowerType, type PowerConfiguration } from "./configuration";
import type { PowerLine } from "./network";
import { isNonnegativeNumber, isPositiveInteger, isPositiveNumber } from "./validation";

export type LineEquivalent = Readonly<{
  nominalKv: number;
  frequencyHz: number;
  seriesOhm: Complex;
  totalShuntSiemens: Complex;
  shuntPerEndSiemens: Complex;
  impedancePerCircuitOhm: Complex;
  susceptancePerKm: number;
  parallelCircuits: number;
  lengthKm: number;
}>;

/** Balanced three-phase line, represented by its per-phase nominal pi network. */
export function generateLineEquivalent(line: PowerLine, type: LineType, nominalKv: number): LineEquivalent {
  const { lengthKm, parallelCircuits } = line;
  const frequencyHz = type.ratedFrequencyHz;
  if (!isPositiveNumber(lengthKm) || !isPositiveInteger(parallelCircuits) || !isPositiveNumber(frequencyHz) ||
      !isPositiveNumber(nominalKv) || !isNonnegativeNumber(type.rOhmPerKm) || !isNonnegativeNumber(type.xOhmPerKm)) {
    throw Error("power-invalid-line-equivalent");
  }
  const susceptancePerKm = type.shunt.kind === "capacitance"
    ? 2 * Math.PI * frequencyHz * type.shunt.faradPerKm
    : type.shunt.siemensPerKm;
  const conductancePerKm = type.gSiemensPerKm ?? 0;
  if (!isNonnegativeNumber(susceptancePerKm) || !isNonnegativeNumber(conductancePerKm)) throw Error("power-invalid-line-equivalent");

  const impedancePerCircuitOhm = { re: type.rOhmPerKm * lengthKm, im: type.xOhmPerKm * lengthKm };
  const seriesOhm = { re: impedancePerCircuitOhm.re / parallelCircuits, im: impedancePerCircuitOhm.im / parallelCircuits };
  const totalShuntSiemens = { re: conductancePerKm * lengthKm * parallelCircuits, im: susceptancePerKm * lengthKm * parallelCircuits };
  const shuntPerEndSiemens = { re: totalShuntSiemens.re / 2, im: totalShuntSiemens.im / 2 };
  if (![...Object.values(impedancePerCircuitOhm), ...Object.values(seriesOhm), ...Object.values(totalShuntSiemens)].every(Number.isFinite)) {
    throw Error("power-line-equivalent-range");
  }
  return { nominalKv, frequencyHz, seriesOhm, totalShuntSiemens, shuntPerEndSiemens,
    impedancePerCircuitOhm, susceptancePerKm, parallelCircuits, lengthKm };
}

export function configuredLineEquivalent(configuration: PowerConfiguration, id: string): LineEquivalent {
  const line = powerEquipment(configuration, id);
  const type = resolveEffectivePowerType(configuration, id);
  if (line.kind !== "line" || type?.kind !== "line") throw Error("power-line-type-required");
  const from = configuration.network.buses.find(bus => bus.id === line.fromBusId)?.nominalKv;
  const to = configuration.network.buses.find(bus => bus.id === line.toBusId)?.nominalKv;
  const nominalKv = type.ratedKv ?? (from === to ? from : undefined);
  if (nominalKv === undefined) throw Error("power-line-ambiguous-voltage");
  return generateLineEquivalent(line, type, nominalKv);
}
