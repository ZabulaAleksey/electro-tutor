import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import baseline from "../../tests/fixtures/electrotutor-20261125-baseline.json";
import { synthesizeCauerI, type CauerElement } from "../models/reactive-cauer-i";
import { synthesizeCauerII } from "../models/reactive-cauer-ii";
import { synthesizeFosterI } from "../models/reactive-foster-i";
import { synthesizeFosterII } from "../models/reactive-foster-ii";
import { readCircuit, solveCircuit } from "../models/reactive-two-port";
import { LcSynthesisNominal, LcSynthesisSchematic } from "./LcSynthesisSchematic";

function size(markup: string) {
  return Number(markup.match(/viewBox="0 0 (\d+) \d+"/)?.[1]);
}

it("renders all four equivalent six-device realizations in at most 335 drawing units", () => {
  const circuit = readCircuit(baseline.reactiveSynthesis.archive.circuit);
  if (!circuit) throw Error("Missing seven-element benchmark");
  const { impedance } = solveCircuit(circuit);
  const forms = [
    { form: "foster-i", terms: synthesizeFosterI(impedance).terms },
    { form: "foster-ii", terms: synthesizeFosterII(impedance).terms },
    { form: "cauer-i", elements: synthesizeCauerI(impedance).elements },
    { form: "cauer-ii", elements: synthesizeCauerII(impedance).elements },
  ] as const;

  for (const synthesis of forms) {
    const result = renderToStaticMarkup(<LcSynthesisSchematic synthesis={synthesis} language="uk" />);
    expect(result.match(/data-lc-symbol="[lc]"/g), synthesis.form).toHaveLength(6);
    const labels = [...result.matchAll(/data-lc-synthesis-label="([LC][0-9]+)"/g)].map(([, name]) => name);
    expect(new Set(labels).size, synthesis.form).toBe(6);
    expect(size(result), synthesis.form).toBeLessThanOrEqual(335);
    expect(result, synthesis.form).not.toContain("data-wide");
    expect(result, synthesis.form).toMatch(/(?:мГн|мкФ)/);
  }
});

it("keeps the one-element sketch small and leaves genuinely wide schematics keyboard-scrollable", () => {
  const compact = renderToStaticMarkup(<LcSynthesisSchematic language="ru" synthesis={{
    form: "foster-i", terms: [{ kind: "series-l", strength: 1, henry: .001 }],
  }} />);
  expect(size(compact)).toBeLessThan(140);
  expect(compact).not.toContain("Вписать схему");

  const elements: CauerElement[] = Array.from({ length: 12 }, (_, index) => ({
    placement: index % 2 === 0 ? "series" : "shunt",
    kind: index % 2 === 0 ? "l" : "c",
    valueSI: .001, coefficient: { numerator: 1n, denominator: 1n },
  }));
  const wide = renderToStaticMarkup(<LcSynthesisSchematic synthesis={{ form: "cauer-i", elements }} language="ru" />);
  expect(wide).toContain("Вписать схему");
  expect(wide).toContain('data-wide="true" tabindex="0" role="region"');
  expect(wide.match(/data-lc-symbol="[lc]"/g)).toHaveLength(12);
});

it("gives the number and its complete SI unit a single wrap boundary", () => {
  const nominal = renderToStaticMarkup(<LcSynthesisNominal value={124.305e-6} unit="F" language="uk" />);
  expect(nominal).toBe('124,305 <span class="lc-synthesis-unit">мкФ</span>');
});
