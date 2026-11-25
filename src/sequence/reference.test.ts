import { expect, test } from "vitest";
import { newSequenceDocument, phases, z, type SequenceDocument } from "./contract";
import { solveSequence } from "./solve";

function openPhaseBetweenTwoCuts(document: SequenceDocument) {
  return {
    ...document,
    edits: [
      { id: "CutFirst", kind: "open", area: "line", at: .25, phases: ["A"] },
      { id: "CutLast", kind: "open", area: "line", at: .75, phases: ["A"] },
    ],
  } satisfies SequenceDocument;
}

test("distinguishes an isolated middle phase from the two grounded phases in the same section", () => {
  const result = solveSequence(openPhaseBetweenTwoCuts(newSequenceDocument()));
  if (!result.ok) throw Error(result.reason);
  const line = result.readings.filter(reading => reading.area === "line");
  expect(line.map(reading => reading.reference)).toEqual(["ground", "mixed-reference", "ground"]);
  expect(line[1].phaseGrounded).toEqual([false, true, true]);
  expect(line[1].currentABC[0].re).toBeCloseTo(0, 12);
  expect(line[1].currentABC[0].im).toBeCloseTo(0, 12);
  expect(result.gaugeFixed).toBe(true);
});

test("distinguishes two floating islands even when no selected phase is grounded", () => {
  const neutral = { mode: "isolated", impedance: z() } as const;
  const document = { ...newSequenceDocument(), generatorNeutral: neutral, loadNeutral: neutral };
  const result = solveSequence(openPhaseBetweenTwoCuts(document));
  if (!result.ok) throw Error(result.reason);
  const line = result.readings.filter(reading => reading.area === "line");
  expect(line.map(reading => reading.reference)).toEqual(["floating-reference", "mixed-reference", "floating-reference"]);
  expect(line[1].phaseGrounded).toEqual([false, false, false]);
  expect(line[1].zeroPath).toBe(false);
});

test("colocated symmetric series drops and complementary opens create no sequence coupling", () => {
  const document = newSequenceDocument();
  const series = solveSequence({ ...document, edits: phases.map(phase =>
    ({ id: "Series" + phase, kind: "series", area: "line", at: .5, phases: [phase], impedance: z(2, .3) })) });
  if (!series.ok) throw Error(series.reason);
  expect(series.couplings).toEqual([]);
  const positive = series.readings.find(reading => reading.area === "line")!;
  expect(positive.current012[0].re).toBeCloseTo(0, 12);
  expect(positive.current012[2].im).toBeCloseTo(0, 12);

  const opened = solveSequence({ ...document, edits: phases.map(phase =>
    ({ id: "Open" + phase, kind: "open", area: "line", at: .5, phases: [phase] })) });
  if (!opened.ok) throw Error(opened.reason);
  expect(opened.couplings).toEqual([]);
  for (const sequence of opened.readings.find(reading => reading.area === "line")!.current012) {
    expect(sequence.re).toBeCloseTo(0, 12);
    expect(sequence.im).toBeCloseTo(0, 12);
  }
});
