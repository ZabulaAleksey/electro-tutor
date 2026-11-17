import type { Complex } from "../models/circular-diagram";
import type { TransformerType } from "./catalogue";
import { powerEquipment, resolveEffectivePowerType, type PowerConfiguration } from "./configuration";
import type { PowerTransformer } from "./network";
import { isNonnegativeNumber, isPositiveInteger, isPositiveNumber } from "./validation";

export type TransformerEquivalent = Readonly<{
  highKv: number;
  lowKv: number;
  ratedMva: number;
  zBaseOhm: number;
  seriesOhm: Complex;
  shuntSiemens: Complex;
  parallelUnits: number;
  tapRatioHvSide: number;
  phaseShiftDeg: number;
  nominalLosses: Readonly<{
    noLoadActiveKw: number;
    noLoadReactiveKvar: number;
    ratedSeriesActiveKw: number;
    ratedSeriesReactiveKvar: number;
  }>;
}>;

function transformerRatio(transformer: PowerTransformer, type: TransformerType): number {
  const tap = type.tap;
  const position = transformer.tapPosition ?? tap?.neutral;
  const neutralRatio = type.highKv / type.lowKv;
  if (position === undefined) return neutralRatio;
  if (!tap || ![position, tap.min, tap.neutral, tap.max].every(Number.isSafeInteger) ||
      position < tap.min || position > tap.max || tap.neutral < tap.min || tap.neutral > tap.max ||
      !isPositiveNumber(tap.percentPerStep)) throw Error("power-invalid-transformer-tap");
  return neutralRatio * (1 + (position - tap.neutral) * tap.percentPerStep / 100);
}

/** Positive-sequence L equivalent on the nameplate HV base. Phase shift is LV minus HV. */
export function generateTransformerEquivalent(transformer: PowerTransformer, type: TransformerType): TransformerEquivalent {
  const { parallelUnits } = transformer;
  const { ratedMva, highKv, lowKv } = type;
  const phaseShiftDeg = type.phaseShiftDeg ?? 0;
  if (!isPositiveInteger(parallelUnits) || !isPositiveNumber(ratedMva) || !isPositiveNumber(highKv) ||
      !isPositiveNumber(lowKv) || highKv < lowKv || !isPositiveNumber(type.shortCircuitPct) ||
      !isNonnegativeNumber(type.noLoadLossKw) || !isNonnegativeNumber(type.noLoadCurrentPct) ||
      !Number.isFinite(phaseShiftDeg)) throw Error("power-invalid-transformer-equivalent");

  const zBaseOhm = highKv * highKv / ratedMva;
  const windingPu = type.shortCircuitPct / 100;
  const activeSeriesKwPerUnit = type.resistance.kind === "load-loss"
    ? type.resistance.kw : ratedMva * 10 * type.resistance.percent;
  const resistancePu = (activeSeriesKwPerUnit / 1000) / ratedMva;
  const noLoadApparentMva = ratedMva * (type.noLoadCurrentPct / 100);
  const noLoadActiveMw = type.noLoadLossKw / 1000;
  if (!isNonnegativeNumber(resistancePu) || resistancePu > windingPu || noLoadActiveMw > noLoadApparentMva) {
    throw Error("power-invalid-transformer-equivalent");
  }
  const reactancePu = Math.sqrt(windingPu - resistancePu) * Math.sqrt(windingPu + resistancePu);
  const noLoadReactiveMvar = Math.sqrt(noLoadApparentMva - noLoadActiveMw) * Math.sqrt(noLoadApparentMva + noLoadActiveMw);
  const seriesOhm = { re: zBaseOhm * resistancePu / parallelUnits, im: zBaseOhm * reactancePu / parallelUnits };
  const shuntSiemens = { re: noLoadActiveMw / (highKv * highKv) * parallelUnits,
    im: -noLoadReactiveMvar / (highKv * highKv) * parallelUnits };
  const tapRatioHvSide = transformerRatio(transformer, type);
  const nominalLosses = {
    noLoadActiveKw: type.noLoadLossKw * parallelUnits,
    noLoadReactiveKvar: noLoadReactiveMvar * 1000 * parallelUnits,
    ratedSeriesActiveKw: activeSeriesKwPerUnit * parallelUnits,
    ratedSeriesReactiveKvar: (ratedMva * reactancePu) * 1000 * parallelUnits,
  };
  if (!isPositiveNumber(zBaseOhm) || !isPositiveNumber(tapRatioHvSide) ||
      ![...Object.values(seriesOhm), ...Object.values(shuntSiemens), ...Object.values(nominalLosses)].every(Number.isFinite)) {
    throw Error("power-transformer-equivalent-range");
  }
  return { highKv, lowKv, ratedMva, zBaseOhm, seriesOhm, shuntSiemens, parallelUnits, tapRatioHvSide, phaseShiftDeg, nominalLosses };
}

export function configuredTransformerEquivalent(configuration: PowerConfiguration, id: string): TransformerEquivalent {
  const transformer = powerEquipment(configuration, id);
  const type = resolveEffectivePowerType(configuration, id);
  if (transformer.kind !== "transformer" || type?.kind !== "transformer") throw Error("power-transformer-type-required");
  return generateTransformerEquivalent(transformer, type);
}
