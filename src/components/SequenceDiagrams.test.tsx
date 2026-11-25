import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { complexFromPolar } from "../models/circular-diagram";
import { newSequenceDocument, phases, z, type SectionReading, type SequenceDocument, type SequenceSolution, type Triple } from "../sequence/contract";
import { sequencePhaseTerms } from "../sequence/solve";
import { SequenceCircuit, SequenceResults } from "./SequenceDiagrams";

it("draws explicit phase edits, branch endpoints and separate neutral connections", () => {
  const document: SequenceDocument = {
    ...newSequenceDocument(),
    loadNeutral: { mode: "isolated", impedance: z() },
    edits: [
      { id: "tap", area: "line", at: .5, phases: ["A"], kind: "shunt", target: "C", impedance: z() },
      { id: "break", area: "generator", at: .5, phases: ["B"], kind: "open" },
    ],
  };
  const graph = renderToStaticMarkup(
    <SequenceCircuit document={document} language="uk" selectedArea="line" selectedAt={.5} onSelect={() => {}} />,
  );
  expect(graph.match(/data-seq-phase-wire="[ABC]"/g)).toHaveLength(3);
  expect(graph.match(/data-seq-pick-area=/g)).toHaveLength(3);
  expect(graph).toContain('data-seq-neutral="generator" data-mode="grounded"');
  expect(graph).toContain('data-seq-neutral="load" data-mode="isolated"');
  expect(graph).toContain('data-seq-edit-kind="open" data-seq-edit-id="break"');
  const shunt = graph.slice(graph.indexOf('data-seq-edit-id="tap"'));
  expect(shunt).toContain('d="M282 82V111M282 117V146"');
  expect(shunt).toContain('cx="282" cy="82"');
  expect(shunt).toContain('cx="282" cy="146"');
  expect(shunt).not.toContain('cx="282" cy="114"');
});

it("joins a finite multiphase ground fault before one fault impedance and earth glyph", () => {
  const document: SequenceDocument = {
    ...newSequenceDocument(),
    edits: [{ id: "shared-earth", area: "line", at: .5, phases: ["B", "C"], kind: "shunt", target: "ground", impedance: z(3, 2) }],
  };
  const graph = renderToStaticMarkup(
    <SequenceCircuit document={document} language="ru" selectedArea="line" selectedAt={.5} onSelect={() => {}} />,
  );
  const fault = graph.slice(graph.indexOf('data-seq-edit-id="shared-earth"'));
  expect(fault.match(/class="seq-impedance"/g)).toHaveLength(1);
  expect(fault.match(/class="seq-ground"/g)).toHaveLength(1);
  expect(fault).toContain('d="M276.5 114V143M276.5 149V159"');
  expect(fault).toContain('d="M287.5 146V159"');
  expect(fault).toContain('d="M276.5 159H287.5M282 159V169"');
  expect(fault).toContain('class="seq-node" cx="282" cy="159"');
});

it("keeps three sequence rows, genuine reported couplings and separate voltage/current plots", () => {
  const document = newSequenceDocument();
  const reading: SectionReading = {
    id: "line:0-1", area: "line", from: 0, to: 1,
    voltageABC: [z(230), z(-115, -115 * Math.sqrt(3)), z(-115, 115 * Math.sqrt(3))],
    currentABC: [z(2), z(-1, -Math.sqrt(3)), z(-1, Math.sqrt(3))],
    voltage012: [z(7e-15), z(230), z()], current012: [z(0, 5e-16), z(2), z(-3e-16, 4e-16)],
    reference: "floating-reference", zeroPath: false,
  };
  const solution: Extract<SequenceSolution, { ok: true }> = {
    ok: true, readings: [reading], faultCurrents: {}, maxResidual: 0, gaugeFixed: true,
    neutralVoltages: { generator: z(), load: z() },
    couplings: [{ id: "fault-at-midsection", area: "line", at: .5, sequences: [1, 2] }],
  };
  const content = renderToStaticMarkup(<SequenceResults document={document} solution={solution} reading={reading} language="ru" />);
  expect(content.match(/data-seq-network="[012]"/g)).toHaveLength(3);
  expect(content).toContain('data-seq-network="0" data-open="true"');
  expect(content).toContain('data-seq-zero-path="false"');
  expect(content).toContain('data-seq-reference="floating-reference"');
  expect(content).toContain('data-seq-coupling-link="fault-at-midsection"');
  expect(content).toContain('d="M282 61V113"');
  expect(content).toContain('data-seq-phasors="voltage"');
  expect(content).toContain('data-seq-phasors="current"');
  expect(content.match(/data-seq-reading=/g)).toHaveLength(12);
  expect(content).toContain('data-seq-reading="U1" data-re="230" data-im="0" data-magnitude="230" data-angle="0"');
  for (const id of ["U0", "I0", "I2"]) {
    expect(content).toContain(`data-seq-reading="${id}" data-re="0" data-im="0" data-magnitude="0">`);
    expect(content).toContain(`data-seq-vector="${id}" data-zero="true"`);
  }
  expect(reading.voltage012[0]).toEqual(z(7e-15));
});

const pureSequences: readonly { name: string; values: Triple; expected: Triple; sequence: 0 | 1 | 2 }[] = [
  { name: "zero", values: [z(2), z(), z()], expected: [z(2), z(2), z(2)], sequence: 0 },
  { name: "positive", values: [z(), z(2), z()], expected: [z(2), z(-1, -Math.sqrt(3)), z(-1, Math.sqrt(3))], sequence: 1 },
  { name: "negative", values: [z(), z(), z(2)], expected: [z(2), z(-1, Math.sqrt(3)), z(-1, -Math.sqrt(3))], sequence: 2 },
];

it.each(pureSequences)("projects pure $name components to all three phase sums", ({ values, expected, sequence }) => {
  for (const [phaseIndex, phase] of phases.entries()) {
    const terms = sequencePhaseTerms(values, phase);
    expect(terms[sequence]).toEqual(expected[phaseIndex]);
    expect(terms.filter(term => Math.hypot(term.re, term.im) > 0)).toHaveLength(1);
  }
});

it("normalizes last-bit differences in phasor markup and preserves nonzero readings below plot resolution", () => {
  const document = newSequenceDocument();
  function renderReading(angle: number) {
    const angled = complexFromPolar(2.3456789012345e-10, angle);
    const reading: SectionReading = {
      id: "line:0-1", area: "line", from: 0, to: 1,
      voltageABC: [z(230), z(), z()], voltage012: [z(), z(230), z()],
      currentABC: [angled, z(), z()], current012: [z(2e-20), angled, z()],
      reference: "ground", zeroPath: true,
    };
    const solution: Extract<SequenceSolution, { ok: true }> = {
      ok: true, readings: [reading], couplings: [], faultCurrents: {}, maxResidual: 0, gaugeFixed: false,
      neutralVoltages: { generator: z(), load: z() },
    };
    return renderToStaticMarkup(<SequenceResults document={document} solution={solution} reading={reading} language="ru" />);
  }

  const markup = renderReading(104.66433433100711);
  expect(markup).toBe(renderReading(104.66433433100713));
  expect(markup).toContain('data-angle="104.664334331"');
  expect(markup).toContain('data-seq-vector="I0" data-zero="false"');
  expect(markup).toContain('data-seq-reading="I0" data-re="2e-20" data-im="0" data-magnitude="2e-20" data-angle="0"');
});

it("omits undefined mixed-reference voltage vectors and shows only grounded phase voltages", () => {
  const document = newSequenceDocument();
  const reading: SectionReading = {
    id: "line:0-1", area: "line", from: 0, to: 1,
    voltageABC: [z(1e16), z(-1.25), z(0, 2)], voltage012: [z(1e16), z(1e16), z(1e16)],
    currentABC: [z(), z(-.5), z(.5)], current012: [z(0), z(0, -.25), z(0, .25)],
    reference: "mixed-reference", phaseGrounded: [false, true, true], zeroPath: false,
  };
  const solution: Extract<SequenceSolution, { ok: true }> = {
    ok: true, readings: [reading], couplings: [], faultCurrents: {}, maxResidual: 0, gaugeFixed: true,
    neutralVoltages: { generator: z(), load: z() },
  };
  const markup = renderToStaticMarkup(<SequenceResults document={document} solution={solution} reading={reading} language="ru" />);
  expect(markup).toContain('data-seq-reference="mixed-reference"');
  expect(markup).toContain('Фазы отсчитываются от разных опор.');
  expect(markup).not.toContain('data-seq-phasors="voltage"');
  expect(markup).toContain('data-seq-phasors="current"');
  for (const id of ["U0", "U1", "U2", "UA"]) {
    expect(markup).toMatch(new RegExp(`data-seq-reading="${id}"><th[^>]*>.*?</th>(<td>—</td>){4}</tr>`));
  }
  expect(markup).toContain('data-seq-reading="UB" data-re="-1.25" data-im="0" data-magnitude="1.25"');
  expect(markup).toContain('data-seq-reading="UC" data-re="0" data-im="2" data-magnitude="2"');
  expect(markup).toContain('data-seq-reading="I2" data-re="0" data-im="0.25" data-magnitude="0.25"');
});
