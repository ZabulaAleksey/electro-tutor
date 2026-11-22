import { expect, it } from "vitest";
import { basisExperimentMaxBytes, type BasisExperiment } from "./basis-experiment-contract";
import { analyzeBasis } from "./basis-experiment-math";
import { defaultBasisExperiment, experimentBoundary, readBasisExperiment, sampleBasisExperiment, writeBasisExperiment } from "./basis-experiment";

it("samples the default formula and handles open and periodic endpoint grids", () => {
  const defaults = defaultBasisExperiment();
  expect(sampleBasisExperiment(defaults)).toHaveLength(64);
  const periodic: BasisExperiment = { ...defaults, sampleCount: 16,
    source: { kind: "signal", expression: "t^2", boundary: "periodic" } };
  expect(sampleBasisExperiment(periodic).at(-1)).toEqual({ re: (15 / 16) ** 2, im: 0 });
  const open: BasisExperiment = { ...periodic, source: { kind: "signal", expression: "x^2", boundary: "open" } };
  expect(sampleBasisExperiment(open).at(-1)).toEqual({ re: 1, im: 0 });
  for (const expression of ["sin(x)\n1", "alert(1)"]) {
    expect(() => sampleBasisExperiment({ ...open, source: { kind: "signal", boundary: "open", expression } }))
      .toThrow("invalid-expression");
  }
});

it("resamples a drawn contour by distance and preserves its scale and endpoints", () => {
  const experiment: BasisExperiment = { ...defaultBasisExperiment(), sampleCount: 16, source: {
    kind: "contour", closed: false, points: [{ re: -.75, im: .25 }, { re: -.25, im: .25 }, { re: .75, im: .25 }],
  } };
  const sampled = sampleBasisExperiment(experiment);
  expect(sampled[0]).toEqual({ re: -.75, im: .25 });
  expect(sampled.at(-1)).toEqual({ re: .75, im: .25 });
  expect(sampled[3].re).toBeCloseTo(-.45, 14);
  expect(sampled.every(point => point.im === .25)).toBe(true);
  const insufficient: BasisExperiment = { ...experiment, source: { kind: "contour", closed: true, points: sampled.slice(0, 2) } };
  expect(() => sampleBasisExperiment(insufficient)).toThrow("insufficient-contour");
});

it("recloses and recalculates a native archive using its source and numerical settings", () => {
  const experiment: BasisExperiment = { ...defaultBasisExperiment(), basis: "symlets", count: 10,
    source: { kind: "contour", closed: true, points: [{ re: -.8, im: .1 }, { re: .2, im: 1 }, { re: 1, im: -.6 }] } };
  const analyze = (document: BasisExperiment) => analyzeBasis(sampleBasisExperiment(document), {
    basis: document.basis, boundary: experimentBoundary(document), count: document.count, level: document.level,
  });
  const original = analyze(experiment);
  const archive = JSON.parse(writeBasisExperiment(experiment, original));
  expect(archive.result.coefficients.filter(({ active }: { active: boolean }) => active)).toHaveLength(10);
  archive.result = { rms: 900, max: 900, coefficients: [] };
  const loaded = readBasisExperiment(JSON.stringify(archive));
  expect(loaded).toEqual(experiment);
  expect(analyze(loaded).rms).toBe(original.rms);
  expect(() => readBasisExperiment(JSON.stringify({ ...archive, count: 65 }))).toThrow("invalid-archive");
  expect(() => readBasisExperiment(JSON.stringify({ ...archive, source: { ...archive.source, points: [{ re: 0, im: 10 }] } })))
    .toThrow("invalid-contour");
  expect(() => readBasisExperiment("\u044f".repeat(basisExperimentMaxBytes / 2 + 1))).toThrow("archive-limit");
});
