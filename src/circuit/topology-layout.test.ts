import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutTopology, type Point, type TopologyLayout } from "./topology-layout";
import { TopologySession, type TopologyLabDocument } from "./topology-session";
import { netlist, type CircuitComponent } from "./topology";

const fixture = JSON.parse(readFileSync(new URL("../../tests/topology-eval/stage-2-proposed.json", import.meta.url), "utf8"));
const glyph = { halfWidth: 60, halfHeight: 40 };
const terminalOffset = 52;
const minHitSize = 44 / 0.75;

function resistor(id: string): CircuitComponent {
  return { id, kind: "r", terminals: [id + ":a", id + ":b"], parameters: { ohm: 10 } };
}

function chain(count: number) {
  const components = Array.from({ length: count }, (_, index) => resistor("R" + String(index + 1).padStart(3, "0")));
  const wires = components.slice(1).map((part, i) => ({
    id: "W" + String(i + 1).padStart(3, "0"), from: components[i].terminals[1], to: part.terminals[0],
  }));
  return new TopologySession(JSON.stringify({
    kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology: { components, junctions: [], wires }, observedEndpoints: [], attachmentSides: [],
  }));
}

type Segment = { id: string; net: number; a: Point; b: Point };

function openOverlap(a: number, b: number, c: number, d: number) {
  return Math.max(Math.min(a, b), Math.min(c, d)) < Math.min(Math.max(a, b), Math.max(c, d));
}

// Checks the layout against graph endpoints and geometric intervals independently of its routing choices.
function checkLayout(document: TopologyLabDocument, layout: TopologyLayout) {
  const { topology } = document;
  expect(layout.components.map(({ id }) => id).sort()).toEqual(topology.components.map(({ id }) => id).sort());
  expect(layout.junctions.map(({ id }) => id).sort()).toEqual([...topology.junctions].sort());
  expect(layout.wires.map(({ id }) => id).sort()).toEqual(topology.wires.map(({ id }) => id).sort());
  expect(layout.endpoints.size).toBe(topology.components.length * 2 + topology.junctions.length);
  const symbols = [...layout.components, ...layout.junctions];
  const markers = [...layout.anchors.values()].flatMap(({ left, right }) => [left, right]);
  expect(layout.anchors.size).toBe(symbols.length);

  const violations: string[] = [];
  for (const [index, a] of symbols.entries()) {
    for (const b of symbols.slice(index + 1)) {
      if (Math.abs(a.x - b.x) < glyph.halfWidth * 2 && Math.abs(a.y - b.y) < glyph.halfHeight * 2) {
        violations.push(`glyph overlap: ${a.id} / ${b.id}`);
      }
    }
    for (const marker of markers) {
      if (Math.abs(a.x - marker.x) < glyph.halfWidth + minHitSize / 2 &&
        Math.abs(a.y - marker.y) < glyph.halfHeight + minHitSize / 2) {
        violations.push(`marker covers glyph or label: ${a.id}`);
      }
    }
  }
  for (const [index, a] of markers.entries()) {
    if (a.x - minHitSize / 2 < 0 || a.x + minHitSize / 2 > layout.width ||
      a.y - minHitSize / 2 < 0 || a.y + minHitSize / 2 > layout.height) {
      violations.push("marker lies outside the canvas");
    }
    for (const b of markers.slice(index + 1)) {
      if (Math.abs(a.x - b.x) < minHitSize && Math.abs(a.y - b.y) < minHitSize) {
        violations.push("marker hitboxes overlap");
      }
    }
  }

  const netByEndpoint = new Map(netlist(topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  const wireById = new Map(topology.wires.map(wire => [wire.id, wire]));
  const segments: Segment[] = [];
  for (const { id, points } of layout.wires) {
    const wire = wireById.get(id)!;
    expect(points[0]).toEqual(layout.endpoints.get(wire.from));
    expect(points.at(-1)).toEqual(layout.endpoints.get(wire.to));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const horizontal = a.y === b.y;
      if (horizontal ? a.x === b.x : a.x !== b.x) {
        violations.push(`invalid orthogonal segment: ${id}`);
        continue;
      }
      if ([a, b].some(({ x, y }) => x < 0 || y < 0 || x > layout.width || y > layout.height)) {
        violations.push(`wire outside canvas: ${id}`);
      }
      for (const { id: symbolId, x, y } of symbols) {
        const part = topology.components.find(({ id }) => id === symbolId);
        const attached = part
          ? part.terminals.includes(wire.from) || part.terminals.includes(wire.to)
          : symbolId === wire.from || symbolId === wire.to;
        const halfWidth = attached ? terminalOffset : glyph.halfWidth;
        const hits = horizontal
          ? Math.abs(a.y - y) < glyph.halfHeight && openOverlap(a.x, b.x, x - halfWidth, x + halfWidth)
          : Math.abs(a.x - x) < halfWidth && openOverlap(a.y, b.y, y - glyph.halfHeight, y + glyph.halfHeight);
        if (hits && (part || !attached)) violations.push(`wire ${id} overlaps ${symbolId}`);
      }
      segments.push({ id, net: netByEndpoint.get(wire.from)!, a, b });
    }
  }
  for (const [index, { id, net, a, b }] of segments.entries()) {
    for (const other of segments.slice(index + 1)) {
      if (net === other.net) continue;
      const { a: c, b: d } = other;
      const horizontal = a.y === b.y && a.y === c.y && a.y === d.y;
      const vertical = a.x === b.x && a.x === c.x && a.x === d.x;
      if ((horizontal && openOverlap(a.x, b.x, c.x, d.x)) ||
        (vertical && openOverlap(a.y, b.y, c.y, d.y))) {
        violations.push(`different electric nets overlap: ${id} / ${other.id}`);
      }
    }
  }
  expect(violations).toEqual([]);
}

describe("Stage 3 SVG geometry", () => {
  it.each([1, 10, 50, 200])("projects %s components without geometric ambiguity", count => {
    const session = chain(count);
    const before = session.export();
    const result = layoutTopology(session.document);
    checkLayout(session.document, result);
    expect(result.width).toBeLessThan(3000);
    expect(result.height).toBeLessThan(6500);
    for (const { id, x, y } of result.components) {
      expect(result.endpoints.get(id + ":a")).toEqual({ x: x - 52, y });
      expect(result.endpoints.get(id + ":b")).toEqual({ x: x + 52, y });
    }
    expect(layoutTopology(session.document)).toEqual(result);
    expect(session.export()).toBe(before);
  });

  it("projects the accepted E3 topology and honors the two side hints on the same electrical pair", () => {
    const before = new TopologySession(JSON.stringify(fixture.document));
    const base = layoutTopology(before.document);
    checkLayout(before.document, base);
    const trunk = ["J1", "R1", "L1", "TL1", "TL2", "C1"].map(id => base.components.find(part => part.id === id)!);
    expect(trunk.every((part, i) => i === 0 || trunk[i - 1].x < part.x && trunk[i - 1].y === part.y)).toBe(true);

    const electricalResults = [];
    for (const side of ["left", "right"] as const) {
      const session = new TopologySession(before.export());
      const slot = session.listSlots().find(candidate =>
        candidate.kind === "parallel" && candidate.side === side && candidate.componentIds.join("/") === "TL1")!;
      session.apply({ type: "insert", slot, component: resistor("Branch") });
      const result = layoutTopology(session.document);
      checkLayout(session.document, result);
      const branch = result.components.find(({ id }) => id === "Branch")!;
      const line = result.components.find(({ id }) => id === "TL1")!;
      expect(side === "left" ? branch.y < line.y : branch.y > line.y).toBe(true);
      expect(branch.x).toBe(line.x);
      electricalResults.push(netlist(session.document.topology));
    }
    expect(electricalResults[0]).toEqual(electricalResults[1]);
  });

  it("handles a routed bridge, junction-only links and isolated endpoints with the same rules", () => {
    const components = Array.from({ length: 12 }, (_, i) => resistor("R" + (i + 1)));
    const wires = [
      { id: "join", from: "J1", to: "J2" },
      { id: "branch", from: "J1", to: "R1:a" },
      { id: "return", from: "J2", to: "R10:b" },
      { id: "bridge", from: "R2:b", to: "R12:a" },
      { id: "opposite", from: "R4:a", to: "R5:a" },
      { id: "loop", from: "R6:a", to: "R6:b" },
    ];
    const session = new TopologySession(JSON.stringify({
      kind: "electrotutor-topology-lab", schemaVersion: 1,
      topology: { components, junctions: ["J1", "J2", "Isolated"], wires },
      observedEndpoints: ["J1"], attachmentSides: [],
    }));
    checkLayout(session.document, layoutTopology(session.document));
  });
});
