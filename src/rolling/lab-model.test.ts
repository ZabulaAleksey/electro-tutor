import { describe, expect, it } from "vitest";
import { solveRollingFeasibility } from "./feasibility.mjs";
import {
  prepareRollingTrack, readRollingArchive, rollingArchiveMaxBytes,
  rollingPreset, writeRollingArchive,
  type RollingInput,
} from "./lab-model";

const corner: RollingInput = {
  trace: { kind: "stroke", points: [[0, 0], [1, 0], [1, 1]] },
  radius: 1,
  quality: "compact",
};

describe("G trace and archive", () => {
  it("rounds a right angle with a tangent circular arc and preserves the two endpoints", () => {
    const track = prepareRollingTrack(corner);
    expect(track.segments).toHaveLength(3);
    expect(track.segments.map(({ sweep }) => sweep)).toEqual([0, Math.PI / 2, 0]);
    expect(track.segments[0].length).toBeCloseTo(0.84, 12);
    expect(track.segments[1].length).toBeCloseTo(0.16 * Math.PI / 2, 12);
    const { shape, poses } = solveRollingFeasibility(track);
    expect(poses[0].target).toEqual([0, 0]);
    expect(poses.at(-1)?.target[0]).toBeCloseTo(1, 12);
    expect(poses.at(-1)?.target[1]).toBeCloseTo(1, 12);
    expect(shape.vertices.length).toBeGreaterThan(0);
  });

  it("keeps the preset preview on the curve that is sent to the solver", () => {
    for (const preset of ["arc", "s-bend"] as const) {
      const track = prepareRollingTrack({ ...corner, trace: { kind: "preset", preset } });
      const { poses } = solveRollingFeasibility(track);
      const preview = rollingPreset(preset);
      expect(preview.length).toBeGreaterThan(10);
      expect(preview.at(-1)?.[0]).toBeCloseTo(poses.at(-1)!.target[0], 12);
      expect(preview.at(-1)?.[1]).toBeCloseTo(poses.at(-1)!.target[1], 12);
    }
  });

  it("rejects a short trace, reversal, and a complicated trace instead of erasing them", () => {
    expect(() => prepareRollingTrack({
      ...corner, trace: { kind: "stroke", points: [[0, 0], [0.01, 0]] },
    })).toThrow("DEGENERATE_TRACE");
    expect(() => prepareRollingTrack({
      ...corner, trace: { kind: "stroke", points: [[-1, 0], [0.6, 0], [0, 0], [1, 0]] },
    })).toThrow("TRACE_REVERSAL");
    expect(() => prepareRollingTrack({
      ...corner, trace: { kind: "stroke", points: Array.from({ length: 14 }, (_, i) => [i * .22 - 1.5, i % 2 ? .23 : -.23]) },
    })).toThrow("TRACE_COMPLEXITY");
  });

  it("round-trips only trusted inputs and controls from the versioned JSON", () => {
    const raw = JSON.parse(writeRollingArchive(corner, 1.25, .5));
    const archive = readRollingArchive(JSON.stringify({ ...raw, verification: { maxSlipOverSpeed: -7 } }));
    expect(archive).toEqual({
      kind: "electrotutor-rolling-lab", schemaVersion: 1, input: corner, speed: 1.25, position: .5,
    });
    expect(() => readRollingArchive(JSON.stringify({ ...raw, schemaVersion: 9 }))).toThrow("INVALID_ARCHIVE");
    expect(() => readRollingArchive(JSON.stringify({ ...raw, speed: 0 }))).toThrow("INVALID_ARCHIVE");
    expect(() => readRollingArchive(" ".repeat(rollingArchiveMaxBytes + 1))).toThrow("ARCHIVE_LIMIT");
  });
});
