import { expect, it } from "vitest";
import { pinEquipmentType, readEquipmentCatalogue, resolveEquipmentType, type LineType, type TransformerType } from "./catalogue";
import { readPowerNetwork, type PowerLine } from "./network";

const line: LineType = {
  id: "line-test", revision: 1, kind: "line", name: "Учебный тип для теста",
  provenance: { kind: "custom", note: "Вымышленные тестовые данные" },
  ratedFrequencyHz: 50, ratedKv: 110, rOhmPerKm: .23, xOhmPerKm: .41,
  shunt: { kind: "capacitance", faradPerKm: 1.1e-8 }, maxCurrentA: 400, sectionMm2: 120,
};
const transformer: TransformerType = {
  id: "transformer-test", revision: 1, kind: "transformer", name: "Тестовый двухобмоточный тип",
  provenance: { kind: "reference", document: "Синтетический паспорт для теста", publisher: "Тестовый издатель", locator: "стр. 2, таблица 1" },
  ratedMva: 16, highKv: 110, lowKv: 10, shortCircuitPct: 10.5,
  resistance: { kind: "load-loss", kw: 80 }, noLoadLossKw: 20, noLoadCurrentPct: .7,
  phaseShiftDeg: 30, tap: { min: -4, max: 4, neutral: 0, percentPerStep: 2.5 },
};
const equipment: PowerLine = {
  kind: "line", id: "A1", fromBusId: "A", toBusId: "B", lengthKm: 20, parallelCircuits: 1, inService: true,
};
const read = (types: readonly unknown[]) => readEquipmentCatalogue({ schemaVersion: 1, types });

it("retains custom and document-based records with distinct revision identities", () => {
  const newer = { ...line, revision: 2, rOhmPerKm: .27 };
  const catalogue = read([newer, transformer, line]);
  expect(catalogue.types).toEqual([newer, transformer, line]);
  expect(resolveEquipmentType(catalogue, { typeId: line.id, typeRevision: 1 })).toEqual(line);
  expect(resolveEquipmentType(catalogue, { typeId: line.id })).toEqual(newer);
  expect(resolveEquipmentType(catalogue, { typeId: line.id, typeRevision: 3 })).toBeUndefined();
});

it("pins a catalogue revision on an imported physical line and preserves older unpinned documents", () => {
  const network = (element: unknown) => readPowerNetwork({
    schemaVersion: 1, buses: [{ id: "A", nominalKv: 110 }, { id: "B", nominalKv: 110 }], elements: [element],
  });
  const pin = pinEquipmentType(equipment, line);
  expect(network(pin).elements[0]).toEqual({ ...equipment, typeId: line.id, typeRevision: 1 });
  expect(network({ ...equipment, typeId: line.id }).elements[0]).toEqual({ ...equipment, typeId: line.id });
  expect(network(equipment).elements[0]).toEqual(equipment);
  expect(() => network({ ...equipment, typeRevision: 1 })).toThrow("power-invalid-element:A1");
  expect(() => network({ ...equipment, typeId: line.id, typeRevision: 0 })).toThrow("power-invalid-element:A1");
  expect(() => pinEquipmentType(equipment, transformer)).toThrow("power-equipment-type-mismatch:A1");
});

it("rejects duplicate revisions, changing kind, and unsupported catalogue versions", () => {
  expect(() => read([line, line])).toThrow("power-duplicate-equipment-revision:line-test:1");
  expect(() => read([line, { ...transformer, id: line.id, revision: 2 }])).toThrow("power-conflicting-equipment-kind:line-test");
  expect(() => readEquipmentCatalogue({ schemaVersion: 2, types: [] })).toThrow("power-invalid-catalogue");
});

it("requires documented provenance and accepts an empty initial catalogue", () => {
  expect(read([])).toEqual({ schemaVersion: 1, types: [] });
  expect(() => read([{ ...transformer, provenance: { ...transformer.provenance, locator: "" } }])).toThrow("power-invalid-provenance");
  expect(() => read([{ ...transformer, provenance: { ...transformer.provenance, url: "unspecified" } }])).toThrow("power-invalid-provenance");
});

it("validates shunt representation, short-circuit resistance and tap bounds", () => {
  expect(read([{ ...line, shunt: { kind: "susceptance", siemensPerKm: .000002 } }]).types[0])
    .toMatchObject({ shunt: { kind: "susceptance", siemensPerKm: .000002 } });
  expect(() => read([{ ...line, shunt: { kind: "capacitance", faradPerKm: 1e-8, siemensPerKm: .000002 } }]))
    .toThrow("power-invalid-equipment-type:line-test");
  expect(() => read([{ ...line, rOhmPerKm: -.01 }])).toThrow("power-invalid-equipment-type:line-test");
  expect(() => read([{ ...transformer, resistance: { kind: "resistance-percent", percent: 11 } }]))
    .toThrow("power-invalid-equipment-type:transformer-test");
  expect(() => read([{ ...transformer, tap: { min: 1, max: 3, neutral: 0, percentPerStep: 2 } }]))
    .toThrow("power-invalid-equipment-type:transformer-test");
});
