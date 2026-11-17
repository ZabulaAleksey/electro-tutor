import { describe, expect, it } from "vitest";
import { emptyDrawing, placeComponent, wireDrawing } from "./drawing";
import { planParallelAttachment } from "./parallel-attachment";
import { regionForComponent } from "./parallel-regions";
import { routeDrawing } from "./routing";

function fixture() {
  let d = placeComponent(emptyDrawing(), "r", { x: 140, y: 180 });
  d = placeComponent(d, "l", { x: 320, y: 180 });
  d = wireDrawing(wireDrawing(d, "R1:b", "L1:a"), "R1:a", "L1:b");
  return d;
}

describe("parallel attachment", () => {
  it("returns an atomic routed candidate", () => {
    const d = fixture();
    const region = regionForComponent(d.topology, "R1")!;
    const routing = routeDrawing(d);
    const planned = planParallelAttachment(d, routing, region, "c");
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.drawing.topology.components).toHaveLength(3);
      expect(planned.drawing.topology.wires).toHaveLength(4);
      expect(planned.routing.unrouted).toEqual([]);
    }
  });

  it("rejects stale region without changing source", () => {
    const d = fixture();
    const region = { id: "stale", boundaries: ["R1:a", "L1:b"] as const, componentIds: ["gone"], wireIds: [], sourceKey: "stale" };
    const result = planParallelAttachment(d, routeDrawing(d), region, "c");
    expect(result).toEqual({ ok: false, reason: "stale-region" });
  });
});
