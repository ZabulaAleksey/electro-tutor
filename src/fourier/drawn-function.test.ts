import { describe, it, expect } from "vitest";
import { paintInterval } from "./drawn-function";
import { defaultBasisExperiment, readBasisExperiment, sampleBasisExperiment, writeBasisExperiment } from "./basis-experiment";
import { analyzeBasis } from "./basis-experiment-math";
import type { BasisExperiment } from "./basis-experiment-contract";

describe("single-valued sampled graph", () => {
  it("paints in either direction, replacing the last value at repeated x", () => {
    const first = paintInterval([0,0,0,0,0], {index:0,y:0}, {index:4,y:1});
    expect(first).toEqual([0,.25,.5,.75,1]);
    const reverse = paintInterval(first, {index:4,y:1}, {index:2,y:-1});
    expect(reverse).toEqual([0,.25,-1,0,1]);
    expect(paintInterval(reverse, {index:2,y:-1}, {index:2,y:.5})).toEqual([0,.25,.5,0,1]);
  });
  it("round trips the drawn source and interpolates at a different grid size", () => {
    const experiment: BasisExperiment = { ...defaultBasisExperiment(), basis:"dct", count:16, sampleCount:16,
      source:{ kind:"drawn", boundary:"open", values:[-1,0,1] } };
    const samples = sampleBasisExperiment(experiment);
    const result = analyzeBasis(samples, { ...experiment, boundary:"open" });
    expect(result.max).toBeLessThan(1e-13);
    expect(readBasisExperiment(writeBasisExperiment(experiment,result))).toEqual(experiment);
    const grid = sampleBasisExperiment({ ...experiment, sampleCount:32 });
    expect(grid[0].re).toBe(-1);
    expect(grid.at(-1)?.re).toBe(1);
    expect(grid[15].re).toBeCloseTo(2*15/31-1, 13);
  });
});
