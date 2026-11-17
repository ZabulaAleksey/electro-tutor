import type { EquipmentCatalogue, LineType, TransformerType } from "../../src/power-system/catalogue";

export const testPowerLine: LineType = {
  id: "line-custom", revision: 1, kind: "line", name: "Учебный тип линии",
  provenance: { kind: "custom", note: "Синтетические данные для проверки" },
  ratedFrequencyHz: 50, ratedKv: 110, rOhmPerKm: .23, xOhmPerKm: .41, shunt: { kind: "capacitance", faradPerKm: 11e-9 },
};
export const testPowerTransformer: TransformerType = {
  id: "transformer-custom", revision: 1, kind: "transformer", name: "Учебный тип трансформатора",
  provenance: { kind: "custom", note: "Синтетические данные для проверки" },
  ratedMva: 16, highKv: 110, lowKv: 10, shortCircuitPct: 10.5, resistance: { kind: "load-loss", kw: 80 },
  noLoadLossKw: 20, noLoadCurrentPct: .7, tap: { min: -4, max: 4, neutral: 0, percentPerStep: 2.5 },
};
export const testPowerCatalogue: EquipmentCatalogue = {
  schemaVersion: 1,
  types: [testPowerLine, { ...testPowerLine, revision: 2, rOhmPerKm: .27 }, testPowerTransformer],
};
