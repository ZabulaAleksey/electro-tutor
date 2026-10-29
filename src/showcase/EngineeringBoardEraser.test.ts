import { describe, expect, it } from "vitest";
import { createEraserSession, erasePolylineSegments, erasePolylineSegmentsWithSession, erasePolylineSegmentsWithStatus } from "./EngineeringBoardEraser";

describe("engineering board partial eraser", () => {
  it("preserves the original payload when the swept path misses", () => {
    const points = "0,0 100,0";
    expect(erasePolylineSegments(points, [{ x: 40, y: 30 }, { x: 60, y: 30 }], 5)).toEqual([points]);
  });

  it("splits a stroke instead of deleting the whole stroke", () => {
    const segments = erasePolylineSegments("0,0 100,0", [{ x: 50, y: 0 }], 8);
    expect(segments.length).toBe(2);
    expect(segments.every((segment) => segment.split(" ").length >= 2)).toBe(true);
    expect(segments.join(" ")).not.toContain("50,0");
  });

  it("uses the adjustable radius as a physical eraser width", () => {
    const narrow = erasePolylineSegments("0,0 100,0", [{ x: 50, y: 0 }], 4).join(" ");
    const wide = erasePolylineSegments("0,0 100,0", [{ x: 50, y: 0 }], 20).join(" ");
    expect(wide.length).toBeLessThan(narrow.length);
  });

  it("uses the whole swept segment when pointer moves are sparse", () => {
    const path = [{ x: 35, y: -20 }, { x: 65, y: 20 }];
    expect(erasePolylineSegments("0,0 100,0", path, 4)).toHaveLength(2);
  });

  it("does not mutate or erase a malformed persisted polyline", () => {
    expect(erasePolylineSegments("not-a-polyline", [{ x: 0, y: 0 }], 10)).toEqual(["not-a-polyline"]);
  });

  it("keeps long saved strokes responsive with an indexed swept path", () => {
    const stroke = Array.from({ length: 12_000 }, (_, index) => `${index / 12},0`).join(" ");
    const path = Array.from({ length: 2_000 }, (_, index) => ({ x: 400 + index / 10, y: 0 }));
    const result = erasePolylineSegmentsWithStatus(stroke, path, 8);
    expect(result.budgetExceeded).toBe(false);
    expect(result.segments.length).toBe(2);
  });

  it("refuses an oversized pointer path atomically instead of truncating it", () => {
    const path = Array.from({ length: 50_001 }, (_, index) => ({ x: index, y: 0 }));
    expect(erasePolylineSegmentsWithStatus("0,0 100,0", path, 8)).toEqual({ segments: ["0,0 100,0"], budgetExceeded: true });
  });

  it("shares the densification budget across a large board commit", () => {
    const sessionResult = createEraserSession([{ x: 500, y: 0 }], 4);
    expect(sessionResult.session).toBeTruthy();
    const stroke = Array.from({ length: 1_000 }, (_, index) => `${index},0`).join(" ");
    let refused = false;
    for (let index = 0; index < 300; index += 1) {
      const result = erasePolylineSegmentsWithSession(stroke, sessionResult.session!);
      if (result.budgetExceeded) {
        refused = true;
        break;
      }
    }
    expect(refused).toBe(true);
  });
});
