import { describe, expect, it } from "vitest";
import { solveRollingFeasibility } from "./feasibility.mjs";
import { prepareRollingTrack, writeRollingObj } from "./lab-model";
import { buildRollingMesh } from "./rolling-mesh";

describe("G convex mesh", () => {
  it("builds a closed outward hull at both resolutions and retains the exterior extreme", () => {
    const counts = [0, 0];
    for (const [level, quality] of ["compact", "full"].entries()) {
      const mesh = buildRollingMesh(1, [[0, 0, 1.6]], quality === "compact" ? "compact" : "full");
      counts[level] = mesh.triangles.length / 3;
      expect(counts[level]).toBeLessThanOrEqual(level ? 1332 : 372);
      const points = mesh.vertices;
      const edges = new Map<string, [number, number]>();
      for (let i = 0; i < mesh.triangles.length; i += 3) {
        const triangle = mesh.triangles.slice(i, i + 3);
        const [a, b, c] = [...triangle].map(index => points.slice(index * 3, index * 3 + 3));
        // Signed volume relative to the known interior point (the origin).
        const determinant = a[0] * (b[1] * c[2] - b[2] * c[1])
          + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
        expect(determinant).toBeGreaterThan(0);
        for (let j = 0; j < 3; j++) {
          const from = triangle[j], to = triangle[(j + 1) % 3];
          const key = from < to ? `${from},${to}` : `${to},${from}`;
          const entry = edges.get(key) ?? [0, 0];
          entry[from < to ? 0 : 1]++;
          edges.set(key, entry);
        }
      }
      expect([...edges.values()].every(([positive, negative]) => positive === 1 && negative === 1)).toBe(true);
      expect(Math.max(...points.filter((_, i) => i % 3 === 2))).toBeCloseTo(1.6, 6);
      const obj = writeRollingObj(mesh);
      expect(obj).toContain("# units: m");
      expect(obj.match(/^f /gm)).toHaveLength(counts[level]);
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });

  it("retains the inverse solver's generators inside the triangulated support planes", () => {
    const track = prepareRollingTrack({ radius: 1, trace: { kind: "preset", preset: "arc" }, quality: "compact" });
    const { shape } = solveRollingFeasibility(track);
    const mesh = buildRollingMesh(shape.radius, shape.vertices, "compact");
    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const [a, b, c] = [...mesh.triangles.slice(i, i + 3)]
        .map(index => mesh.vertices.slice(index * 3, index * 3 + 3));
      const [dx, dy, dz] = b.map((value, axis) => value - a[axis]);
      const [ex, ey, ez] = c.map((value, axis) => value - a[axis]);
      const [nx, ny, nz] = [dy * ez - dz * ey, dz * ex - dx * ez, dx * ey - dy * ex];
      const tolerance = 3e-7 * Math.hypot(nx, ny, nz);
      for (const [x, y, z] of shape.vertices) {
        expect(nx * (x - a[0]) + ny * (y - a[1]) + nz * (z - a[2])).toBeLessThanOrEqual(tolerance);
      }
    }
  });
});
