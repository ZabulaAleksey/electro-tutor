import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../../scripts/rolling-feasibility.mjs", import.meta.url));
const fixture = new URL("../../tests/fixtures/rolling-e10-circle.json", import.meta.url);
const reference = { ...JSON.parse(readFileSync(fixture, "utf8")), start: [2, -3] };

function run(input) {
  if (input === undefined) return spawnSync(process.execPath, [cli, "--eval"], { encoding: "utf8", timeout: 5000 });
  const folder = mkdtempSync(join(tmpdir(), "et-rolling-e10-"));
  const path = join(folder, "trace.json");
  try {
    writeFileSync(path, input);
    return spawnSync(process.execPath, [cli, path], { encoding: "utf8", timeout: 5000 });
  } finally {
    rmSync(path, { force: true });
    rmdirSync(folder);
  }
}

function solve(input) {
  const result = run(JSON.stringify(input));
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("E10 CLI from input to observed contact", () => {
  it("reports the sphere control and inverse convergence", () => {
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.verdict).toBe("PASS");
    expect(report.diagnostics).toContain("CONTACT_NOT_CERTIFIED");
    for (const rows of [report.sphere, report.inverse]) {
      expect(rows.map(row => row.steps)).toEqual([24, 48, 96]);
      expect(rows[2].maxTraceOverRadius).toBeLessThan(rows[0].maxTraceOverRadius / 9);
      expect(rows[2].maxSlipOverSpeed).toBeLessThan(rows[0].maxSlipOverSpeed / 9);
    }
  });

  it("returns shape, poses and independently reconstructed endpoint from a real JSON file", () => {
    const result = solve(reference);
    expect(result).toMatchObject({ schemaVersion: 1, verdict: "FEASIBLE", class: "guided-finite-rolling" });
    expect(result.shape.vertices.length).toBeGreaterThan(0);
    expect(result.poses).toHaveLength(97);
    expect(result.verification.contacts).toHaveLength(result.poses.length);
    const expectedX = 2 + Math.sin(reference.segments[0].length);
    expect(result.poses.at(-1).target[0]).toBeCloseTo(expectedX, 10);
    expect(result.verification.contacts.at(-1)[0]).toBeCloseTo(expectedX, 3);
    expect(result.verification.maxTraceOverRadius).toBeLessThan(1e-3);
  });

  it("does not read large world-coordinate rounding as slip on the shortest allowed segment", () => {
    const tiny = { radius: 0.01, heading: 0.4, stepsPerSegment: 1024, segments: [{ length: 1e-8, sweep: 0 }] };
    const origin = solve({ ...tiny, start: [0, 0] });
    const far = solve({ ...tiny, start: [1e4, -1e4] });
    expect(far.verification.maxSlipOverSpeed).toBe(origin.verification.maxSlipOverSpeed);
    expect(far.verification.maxTraceOverRadius).toBe(origin.verification.maxTraceOverRadius);
    expect(far.verification.maxSlipOverSpeed).toBeLessThan(1e-8);
    expect(far.verification.contacts[0]).toEqual([1e4, -1e4]);
  });

  it.each([
    [JSON.stringify({ ...reference, segments: [] }), "DEGENERATE_TRACE"],
    ['{"invalid":', "INVALID_INPUT"],
    [Buffer.from([0xff, 0xfe]), "INVALID_INPUT"],
    [" ".repeat(32 * 1024 + 1), "BUDGET_EXCEEDED"],
  ])("fails safely with the corresponding JSON diagnostic (%#)", (source, code) => {
    const result = run(source);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({ verdict: "REJECTED", code });
  });
});
