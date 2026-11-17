import { describe, expect, it } from "vitest";
import { emptyDrawing, placeComponent, wireDrawing } from "./drawing";
import { regionForComponent, resolveParallelRegions } from "./parallel-regions";

function serial() {
  let d = placeComponent(emptyDrawing(), "r", { x: 100, y: 180 });
  d = placeComponent(d, "l", { x: 220, y: 180 });
  d = wireDrawing(wireDrawing(d, "R1:b", "L1:a"), "R1:a", "L1:b");
  return d;
}

describe("parallel regions", () => {
  it("finds direct component region and reversed boundaries", () => {
    const d = serial();
    const forward = regionForComponent(d.topology, "R1");
    expect(forward?.componentIds).toEqual(["R1"]);
    expect(resolveParallelRegions(d.topology, "R1:b", "R1:a").length).toBeGreaterThan(0);
  });

  it("rejects same-net boundaries", () => {
    const d = serial();
    expect(resolveParallelRegions(d.topology, "R1:a", "L1:b")).toEqual([]);
  });
});
