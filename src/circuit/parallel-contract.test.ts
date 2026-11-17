import { describe, expect, it } from "vitest";
import { emptyDrawing, placeComponent, wireDrawing, type Drawing } from "./drawing";
import { netlist } from "./topology";
import { parseCircuit, serializeCircuit, defaultCircuitSettings } from "./document";
import { parallelTopologyKey, regionForComponent, resolveParallelRegions } from "./parallel-regions";
import { planParallelAttachment } from "./parallel-attachment";
import { clearGeometry, routeDrawing } from "./routing";

function serial() {
  let drawing = { ...emptyDrawing(), board: { width: 600, height: 360 }, extension: { adapter: "test", data: { preserved: true } } };
  for (const [kind, x] of [["r", 120], ["l", 280], ["c", 440]] as const) drawing = placeComponent(drawing, kind, { x, y: 150 }) as typeof drawing;
  return wireDrawing(wireDrawing(drawing, "R1:b", "L1:a"), "L1:b", "C1:a");
}
function netAt(drawing: Drawing, endpoint: string) { return netlist(drawing.topology).find(net => net.includes(endpoint))!; }

describe("universal parallel attachment contract", () => {
  it.each([
    ["R1:a", "R1:b", ["R1"]], ["L1:a", "L1:b", ["L1"]],
    ["R1:a", "L1:b", ["R1", "L1"]], ["R1:a", "C1:b", ["R1", "L1", "C1"]],
  ] as const)("adds X across %s–%s and preserves original electrical graph", (a, b, members) => {
    const source = serial(), before = JSON.stringify(source);
    const region = resolveParallelRegions(source.topology, a, b)[0];
    expect(region.componentIds).toEqual(members);
    const plan = planParallelAttachment(source, routeDrawing(source), region, "r");
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw Error(plan.reason);
    expect(plan.drawing.topology.components.slice(0, 3)).toEqual(source.topology.components);
    expect(plan.drawing.topology.wires.slice(0, 2)).toEqual(source.topology.wires);
    expect(plan.drawing.topology.wires).toHaveLength(4);
    expect(netAt(plan.drawing, a)).toContain(`${plan.componentId}:a`);
    expect(netAt(plan.drawing, b)).toContain(`${plan.componentId}:b`);
    expect(netAt(plan.drawing, a)).not.toContain(b);
    expect(plan.drawing.extension).toEqual(source.extension);
    expect(plan.routing.unrouted).toEqual([]);
    expect(clearGeometry(plan.drawing)).toBe(true);
    expect(parseCircuit(serializeCircuit(plan.drawing, defaultCircuitSettings)).drawing.topology).toEqual(plan.drawing.topology);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("explicitly offers each parallel branch and its union, without a guessed path", () => {
    let drawing = serial();
    drawing = wireDrawing(drawing, "R1:a", "C1:b");
    const regions = resolveParallelRegions(drawing.topology, "R1:a", "L1:a");
    expect(regions.map(region => region.componentIds)).toEqual([["R1"], ["L1", "C1"], ["R1", "L1", "C1"]]);
    expect(regionForComponent(drawing.topology, "R1")?.componentIds).toEqual(["R1"]);
  });

  it("includes internal tap closure and highlights actual inter-component wires", () => {
    let drawing = serial();
    drawing = placeComponent(drawing, "r", { x: 280, y: 280 });
    drawing = wireDrawing(drawing, "R2:a", "L1:a");
    const region = resolveParallelRegions(drawing.topology, "R1:a", "L1:b")[0];
    expect(region.componentIds).toEqual(["R1", "L1", "R2"]);
    expect(region.wireIds).toContain(drawing.topology.wires[0].id);
    expect(region.wireIds).toContain(drawing.topology.wires.at(-1)!.id);
    const onlyR = regionForComponent(drawing.topology, "R1")!;
    expect(onlyR.wireIds).toEqual([]);
  });

  it("supports long sections beyond sixteen elements without path enumeration", () => {
    const topology = { junctions: [], components: Array.from({ length: 40 }, (_, i) => ({ id: `R${i}`, kind: "r", terminals: [`R${i}:a`, `R${i}:b`], parameters: { ohm: 1 } })),
      wires: Array.from({ length: 39 }, (_, i) => ({ id: `w${i}`, from: `R${i}:b`, to: `R${i + 1}:a` })) };
    const regions = resolveParallelRegions(topology, "R0:a", "R39:b");
    expect(regions).toHaveLength(1);
    expect(regions[0].componentIds).toHaveLength(40);
    expect(regions[0].wireIds).toHaveLength(39);
  });

  it("rejects same net, unknown and disconnected boundaries", () => {
    const source = serial();
    expect(resolveParallelRegions(source.topology, "R1:b", "L1:a")).toEqual([]);
    expect(resolveParallelRegions(source.topology, "missing", "L1:a")).toEqual([]);
    const disconnected = placeComponent(source, "r", { x: 100, y: 280 });
    expect(resolveParallelRegions(disconnected.topology, "R1:a", "R2:a")).toEqual([]);
  });

  it("guards reused IDs with changed parameters or connectivity and rejects forged membership", () => {
    const source = serial(), region = regionForComponent(source.topology, "R1")!;
    const changed = { ...source, topology: { ...source.topology, components: source.topology.components.map(part => part.id === "R1" ? { ...part, parameters: { ...part.parameters, ohm: 50 } } : part) } };
    expect(planParallelAttachment(changed, routeDrawing(changed), region, "r")).toEqual({ ok: false, reason: "stale-region" });
    expect(parallelTopologyKey(changed.topology)).not.toBe(region.sourceKey);
    expect(planParallelAttachment(source, routeDrawing(source), { ...region, componentIds: ["C1"] }, "r")).toEqual({ ok: false, reason: "unsupported-region" });
  });

  it("keeps ordered terminal polarity for reversed boundaries and pinned geometry", () => {
    const source = serial();
    source.positions.R1 = { ...source.positions.R1, pinned: true };
    const region = resolveParallelRegions(source.topology, "C1:b", "R1:a")[0];
    const plan = planParallelAttachment(source, routeDrawing(source), region, "c");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(netAt(plan.drawing, "C1:b")).toContain(`${plan.componentId}:a`);
    expect(netAt(plan.drawing, "R1:a")).toContain(`${plan.componentId}:b`);
    expect(plan.drawing.positions.R1).toEqual(source.positions.R1);
    expect(plan.drawing.positions[plan.componentId].rotation).toBe(180);
  });

  it("expands a crowded board without moving pinned components or altering the source", () => {
    let source = emptyDrawing();
    for (const y of [80, 180, 280]) for (const x of [80, 175, 270, 365, 460]) source = placeComponent(source, "r", { x, y });
    for (const id of Object.keys(source.positions)) source.positions[id] = { ...source.positions[id], pinned: true };
    const before = JSON.stringify(source), region = regionForComponent(source.topology, "R6")!;
    const plan = planParallelAttachment(source, routeDrawing(source), region, "c");
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw Error(plan.reason);
    expect(plan.drawing.board?.height).toBeGreaterThan(360);
    expect(plan.drawing.board!.width).toBeLessThanOrEqual(4096);
    expect(plan.drawing.board!.height).toBeLessThanOrEqual(8192);
    for (const [id, position] of Object.entries(source.positions)) expect(plan.drawing.positions[id]).toEqual(position);
    expect(JSON.stringify(source)).toBe(before);
  });
});

it("does not highlight an external boundary tap", () => {
  let source = serial();
  source = placeComponent(source, "r", { x: 100, y: 280 });
  source = wireDrawing(source, "R1:a", "R2:a");
  const tapWire = source.topology.wires.at(-1)!.id;
  const region = resolveParallelRegions(source.topology, "R1:a", "L1:b")[0];
  expect(region.componentIds).toEqual(["R1", "L1"]);
  expect(region.wireIds).not.toContain(tapWire);
  expect(region.wireIds).toContain(source.topology.wires[0].id);
});

it("allocates a component ID without colliding with an existing endpoint", () => {
  const base = serial();
  const source = { ...base, topology: { ...base.topology, junctions: ["R2:a"] }, junctionPositions: { "R2:a": { x: 100, y: 280 } } };
  const region = regionForComponent(source.topology, "R1")!;
  const result = planParallelAttachment(source, routeDrawing(source), region, "r");
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  expect(result.componentId).toBe("R3");
  expect(result.drawing.topology.junctions).toEqual(["R2:a"]);
  expect(parseCircuit(serializeCircuit(result.drawing, defaultCircuitSettings)).drawing.topology).toEqual(result.drawing.topology);
});
