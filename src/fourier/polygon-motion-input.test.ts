import { expect, it } from "vitest";
import { motionJsonMaxBytes } from "./polygon-motion-contract";
import { checkedMotionPoints, defaultPolygonExperiment, motionPresetPoints, readPolygonExperiment } from "./polygon-motion-input";

it("makes the seeded star repeatable and accepts all three preset contours", () => {
  for (const key of ["square", "circle", "star"] as const) {
    expect(checkedMotionPoints(motionPresetPoints(key))).toEqual(motionPresetPoints(key));
  }
  expect(motionPresetPoints("star")).toHaveLength(10);
  expect(() => checkedMotionPoints(Array(3).fill({ re: 1, im: 1 }))).toThrow("invalid-contour");
});

it("retains accepted coefficients but discards archived results and rejects invalid inputs", () => {
  const base = defaultPolygonExperiment();
  const components = [{ shape: "square", scale: .4, angleDegrees: -40, phaseIndex: 47, direction: -1 }];
  const archive = { ...base, components, result: { rms: 901, max: 901 } };
  expect(readPolygonExperiment(JSON.stringify(archive))).toEqual({ ...base, components });
  expect(() => readPolygonExperiment(JSON.stringify({ ...archive, components: [{ ...components[0], scale: 10 }] })))
    .toThrow("invalid-archive");
  expect(() => readPolygonExperiment(JSON.stringify({ ...archive, options: { ...base.options, family: "circle" } })))
    .toThrow("invalid-archive");
  expect(() => readPolygonExperiment("\u044f".repeat(motionJsonMaxBytes / 2 + 1))).toThrow("archive-limit");
});
