import { expect, it } from "vitest";
import { normalizeLoad, normalizePowerSource } from "./injections";

it("keeps signed PQ and derives inductive/capacitive Q from power factor", () => {
  expect(normalizeLoad({ kind: "pq", activeMw: 10, reactiveMvar: -3 })).toEqual({ activeMw: 10, reactiveMvar: -3 });
  const q = 10 * Math.sqrt(1 - .8 ** 2) / .8;
  expect(normalizeLoad({ kind: "power-factor", activeMw: 10, cosPhi: .8, sign: "inductive" }).reactiveMvar).toBeCloseTo(q);
  expect(normalizeLoad({ kind: "power-factor", activeMw: 10, cosPhi: .8, sign: "capacitive" }).reactiveMvar).toBeCloseTo(-q);
});

it("normalizes source presets/custom voltage and canonical signed angle", () => {
  expect(normalizePowerSource({ id: "S", busId: "A", presetKv: 110, angleDeg: 540 })).toMatchObject({ voltageKv: 110, angleDeg: 180 });
  expect(normalizePowerSource({ id: "S", busId: "A", voltageKv: 123.4, angleDeg: -540 })).toMatchObject({ voltageKv: 123.4, angleDeg: 180 });
});

it("rejects invalid input and conflicting source voltage", () => {
  expect(() => normalizeLoad({ kind: "power-factor", activeMw: 1, cosPhi: 0, sign: "inductive" })).toThrow("power-invalid-load-input");
  expect(() => normalizePowerSource({ id: "S", busId: "A", voltageKv: 110, presetKv: 220 })).toThrow("power-source-voltage-conflict");
  expect(() => normalizePowerSource({ id: "S", busId: "A", voltageKv: 0 })).toThrow("power-invalid-source-input");
});
it("has a single unity-power-factor representation and guards overflow", () => {
  expect(normalizeLoad({ kind: "power-factor", activeMw: 10, cosPhi: 1, sign: "capacitive" })).toEqual({ activeMw: 10, reactiveMvar: 0 });
  expect(() => normalizeLoad({ kind: "power-factor", activeMw: 1e308, cosPhi: .01, sign: "inductive" })).toThrow("power-invalid-load-input");
  expect(() => normalizePowerSource({ id: "S", busId: "A", voltageKv: 110, angleDeg: Number.POSITIVE_INFINITY })).toThrow("power-invalid-source-input");
});
