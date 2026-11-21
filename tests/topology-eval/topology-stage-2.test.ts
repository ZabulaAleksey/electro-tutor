import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TopologySession, parseTopologyLabDocument } from "../../src/circuit/topology-session";
import { netlist, type CircuitComponent, type CircuitTopology } from "../../src/circuit/topology";
import type { TopologySide, TopologySlot } from "../../src/circuit/topology-slots";

type Ref = { number: number; ends: [string, string] } & (
  | { kind: "series"; wireId: string }
  | { kind: "parallel"; componentIds: string[]; side: TopologySide }
  | { kind: "cross" }
);
const fixture: {
  status: string;
  document: { topology: CircuitTopology };
  reference10: number[];
  reference14: number[];
  slots: Ref[];
} = JSON.parse(readFileSync(new URL("stage-2-proposed.json", import.meta.url), "utf8"));
const text = JSON.stringify(fixture.document);
const resistor = (id: string, ohm = 10): CircuitComponent =>
  ({ id, kind: "r", terminals: [id + ":a", id + ":b"], parameters: { ohm } });
const part = (id: string, kind: "l" | "c", value: number): CircuitComponent =>
  ({ id, kind, terminals: [id + ":a", id + ":b"], parameters: { [kind === "l" ? "henry" : "farad"]: value } });

function create(topology: CircuitTopology, observedEndpoints: string[] = []) {
  return new TopologySession(JSON.stringify({
    kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology, observedEndpoints, attachmentSides: [],
  }));
}

function series(session: TopologySession, wireId: string) {
  const slot = session.listSlots().find((value) => value.kind === "series" && value.wireId === wireId);
  if (slot?.kind !== "series") throw Error("missing-series-slot:" + wireId);
  return slot;
}

function parallel(session: TopologySession, ids: string[], side: TopologySide) {
  const slot = session.listSlots().find((value) => value.kind === "parallel" && value.side === side
    && value.componentIds.length === ids.length && ids.every((id) => value.componentIds.includes(id)));
  if (slot?.kind !== "parallel") throw Error("missing-parallel-slot:" + ids.join(","));
  return slot;
}

function observe(topology: CircuitTopology) {
  const memberships = new Map(netlist(topology).flatMap((group, number) => group.map((id) => [id, number] as const)));
  return (id: string) => {
    const value = memberships.get(id);
    if (value === undefined) throw Error("unknown-eval-endpoint:" + id);
    return value;
  };
}

function selected(session: TopologySession, ref: Ref): TopologySlot {
  switch (ref.kind) {
    case "series": return series(session, ref.wireId);
    case "parallel": return parallel(session, ref.componentIds, ref.side);
    case "cross": return session.crossSlot(...ref.ends);
  }
}

function chain(components: CircuitComponent[]): CircuitTopology {
  return {
    components, junctions: [],
    wires: components.slice(1).map((part, offset) =>
      ({ id: "w" + offset, from: components[offset].terminals[1], to: part.terminals[0] })),
  };
}

describe("FR-601/602 · lab JSON → select → insert → electrical netlist → history → import", () => {
  it("labels both numbered maps as proposed and does not conflate equal electrical sides", () => {
    expect(fixture.status).toBe("proposed-replacement-fixture");
    expect(fixture.reference10).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(fixture.reference14).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    const session = new TopologySession(text);
    const byNumber = (number: number) => selected(session, fixture.slots.find((ref) => ref.number === number)!);
    const node = observe(session.document.topology);
    for (const [left, right] of [[8, 12], [9, 11], [10, 13]]) {
      const a = byNumber(left), b = byNumber(right);
      expect(a.id).not.toBe(b.id);
      expect(a.boundaries.map(node).sort()).toEqual(b.boundaries.map(node).sort());
      expect(a).toMatchObject({ kind: "parallel", side: "left" });
      expect(b).toMatchObject({ kind: "parallel", side: "right" });
    }
    expect(byNumber(14)).toMatchObject({ componentIds: expect.arrayContaining(["R1", "L1"]) });
  });

  it.each(fixture.slots)("executes proposed slot $number ($kind) and roundtrips", (ref) => {
    const session = new TopologySession(text);
    const before = session.export(), oldNet = observe(session.document.topology);
    const slot = selected(session, ref);
    expect(slot.boundaries.map(oldNet).sort()).toEqual(ref.ends.map(oldNet).sort());

    const device = resistor("inserted");
    session.apply({ type: "insert", slot, component: device });
    const after = session.export(), currentNet = observe(session.document.topology);
    const [a, b] = slot.boundaries;
    expect(currentNet(device.terminals[0])).toBe(currentNet(a));
    expect(currentNet(device.terminals[1])).toBe(currentNet(b));
    expect(currentNet(a)).not.toBe(currentNet(b));
    const endpoints = netlist(parseTopologyLabDocument(before).topology).flat();
    for (const first of endpoints) {
      for (const second of endpoints) {
        // A series slot may only split its own net. Other attachments preserve old memberships.
        if (ref.kind === "series" && oldNet(first) === oldNet(a) && oldNet(second) === oldNet(a)) continue;
        expect(currentNet(first) === currentNet(second)).toBe(oldNet(first) === oldNet(second));
      }
    }
    expect(session.document.attachmentSides).toEqual(ref.kind === "parallel"
      ? [{ componentId: device.id, side: ref.side }] : []);
    expect(session.document.observedEndpoints).toEqual(["J1:a"]);
    expect(session.document.topology.components.find(({ id }) => id === device.id)).toEqual(device);
    expect(session.listSlots().every((next) => next.sourceKey !== slot.sourceKey)).toBe(true);

    expect(session.undo()).toBe(true);
    expect(session.export()).toBe(before);
    expect(session.redo()).toBe(true);
    expect(session.export()).toBe(after);
    const reloaded = new TopologySession(after);
    expect(reloaded.export()).toBe(after);
    expect(reloaded.canUndo).toBe(false);
  });
});

describe("E1/E3/E11 · topology invariants across edits", () => {
  it("enumerates all continuous R–C–L subgroups and permits a branch inside another branch", () => {
    const session = create(chain([resistor("R"), part("C", "c", 0.001), part("L", "l", 0.1)]));
    const leftGroups = session.listSlots().flatMap((slot) =>
      slot.kind === "parallel" && slot.side === "left" ? [[...slot.componentIds].sort().join("")] : []);
    expect([...leftGroups].sort()).toEqual(["C", "CL", "CLR", "CR", "L", "R"]);

    const branch = resistor("Nested");
    session.apply({ type: "insert", slot: parallel(session, ["R", "C"], "left"), component: branch });
    const branchWire = session.document.topology.wires.find((wire) =>
      wire.from === branch.terminals[0] || wire.to === branch.terminals[0])!;
    session.apply({ type: "insert", slot: series(session, branchWire.id), component: part("NestedL", "l", 0.02) });
    const recursive = parallel(session, ["Nested", "NestedL"], "right");
    session.apply({ type: "insert", slot: recursive, component: part("NestedC", "c", 0.003) });
    expect(session.document.attachmentSides).toEqual([
      { componentId: "Nested", side: "left" }, { componentId: "NestedC", side: "right" },
    ]);
    const node = observe(session.document.topology);
    expect(node("NestedC:a")).toBe(node(recursive.boundaries[0]));
    expect(node("NestedC:b")).toBe(node(recursive.boundaries[1]));
    expect(new TopologySession(session.export()).export()).toBe(session.export());
  });

  it("rejects stale slots and invalid circuits atomically, preserving redo", () => {
    const session = new TopologySession(text);
    const chosen = series(session, "w-r-l");
    session.apply({ type: "insert", slot: chosen, component: resistor("added") });
    const after = session.export();
    expect(() => session.apply({ type: "insert", slot: chosen, component: resistor("stale") })).toThrow();
    expect(session.export()).toBe(after);
    expect(session.undo()).toBe(true);
    expect(() => session.apply({ type: "insert", slot: chosen, component: resistor("invalid", -1) })).toThrow();
    expect(session.canRedo).toBe(true);
    expect(session.redo()).toBe(true);
    expect(session.export()).toBe(after);
    expect(() => new TopologySession(JSON.stringify({ ...fixture.document, schemaVersion: 99 }))).toThrow("unsupported-version");
    expect(() => new TopologySession(JSON.stringify({ ...fixture.document, observedEndpoints: ["missing"] }))).toThrow("invalid-observations");
  });

  it("matches an independent interval oracle on 24 seeded chains with taps and probes", () => {
    for (let seed = 1; seed <= 24; seed++) {
      let word = seed;
      function next() {
        word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
        return word >>> 16;
      }
      const count = 4 + next() % 9;
      const components = Array.from({ length: count }, (_, number) => resistor("P" + number));
      const topology = chain(components);
      const observed: string[] = [];
      const blocked = Array.from({ length: count - 1 }, () => false);
      const extraParts: CircuitComponent[] = [];
      const extraWires: { id: string; from: string; to: string }[] = [];
      for (let i = 0; i < count - 1; i++) {
        const mode = next() % 4;
        if (mode === 1) observed.push(components[i].terminals[1]);
        if (mode === 2) {
          const tap = resistor("Tap" + i);
          extraParts.push(tap);
          extraWires.push({ id: "tap" + i, from: components[i].terminals[1], to: tap.terminals[0] });
        }
        blocked[i] = mode === 1 || mode === 2;
      }
      const session = create({ ...topology,
        wires: [...topology.wires, ...extraWires], components: [...components, ...extraParts],
      }, observed);
      const key = (ids: readonly string[]) => [...ids].sort().join(",");
      const expected = new Set<string>();
      for (let from = 0; from < count; from++) {
        for (let to = from; to < count && (to === from || !blocked[to - 1]); to++) {
          expected.add(key(components.slice(from, to + 1).map(({ id }) => id)));
        }
      }
      const actual = session.listSlots().flatMap((slot) =>
        slot.kind === "parallel" && slot.side === "left" && slot.componentIds.every((id) => id.startsWith("P"))
          ? [key(slot.componentIds)] : []);
      expect(actual).toHaveLength(expected.size);
      expect(new Set(actual)).toEqual(expected);
    }
  });

  it("supports the declared 200-component limit and rejects an over-limit insert atomically", () => {
    const session = create(chain(Array.from({ length: 200 }, (_, i) => resistor("P" + i))));
    const before = session.export();
    const slot = session.crossSlot("P0:a", "P199:b");
    expect(session.listSlots().filter((choice) => choice.kind === "parallel")).toHaveLength(40_200);
    expect(() => session.apply({ type: "insert", slot, component: resistor("overflow") })).toThrow("topology-limit");
    expect(session.export()).toBe(before);
    expect(session.canUndo).toBe(false);
  });

  it("limits session history to 64 snapshots and preserves later changes after reload", () => {
    const session = create(chain([resistor("Loop")]));
    for (let i = 0; i < 67; i++) {
      session.apply({ type: "insert", slot: session.crossSlot("Loop:a", "Loop:b"), component: resistor("R" + i) });
    }
    const latest = session.export();
    let undone = 0;
    while (session.undo()) undone++;
    expect(undone).toBe(64);
    expect(session.document.topology.components).toHaveLength(4);
    while (session.redo()) { /* Restore all redo snapshots. */ }
    expect(session.export()).toBe(latest);
    expect(new TopologySession(latest).canUndo).toBe(false);
  });

  it("canonicalizes unordered graph declarations, preserving component terminal order", () => {
    const graph = fixture.document.topology;
    const reverse = {
      ...fixture.document,
      topology: { components: [...graph.components].reverse(), wires: [...graph.wires].reverse(), junctions: [...graph.junctions].reverse() },
    };
    const canonical = new TopologySession(text);
    const reordered = new TopologySession(JSON.stringify(reverse));
    expect(reordered.export()).toBe(canonical.export());
    expect(reordered.listSlots()).toEqual(canonical.listSlots());
    const source = canonical.document.topology.components.find(({ id }) => id === "J1");
    expect(source?.terminals).toEqual(["J1:a", "J1:b"]);
  });
});

describe("FR-603 · equivalence from the same document path", () => {
  it("moves a resistor with a single history entry and keeps the same series impedance", () => {
    const topology = chain([part("C", "c", 0.01), resistor("A", 2), resistor("B", 3), part("L", "l", 0.1)]);
    const session = create(topology, ["C:a"]);
    const before = session.export();
    const move = series(session, "w2");
    session.apply({ type: "move-series-equivalent", slot: move, componentId: "A", extra: 0 });
    const moved = session.document.topology;
    expect(moved.components.find(({ id }) => id === "A")).toMatchObject({ parameters: { ohm: 2 } });
    const originalR = topology.components.filter(({ kind }) => kind === "r").reduce((sum, device) => sum + Number(device.parameters.ohm), 0);
    const movedR = moved.components.filter(({ kind }) => kind === "r").reduce((sum, device) => sum + Number(device.parameters.ohm), 0);
    expect(movedR).toBe(originalR);
    expect(session.undo()).toBe(true);
    expect(session.export()).toBe(before);
    expect(session.redo()).toBe(true);
  });

  it("keeps placement hints and history when a move leaves the element in place", () => {
    const topology = chain([part("C", "c", 0.01), resistor("A", 2), resistor("B", 3)]);
    const session = new TopologySession(JSON.stringify({
      ...create(topology).document, attachmentSides: [{ componentId: "A", side: "left" }],
    }));
    const before = session.export();
    const chosen = series(session, "w1");
    session.apply({ type: "move-series-equivalent", slot: chosen, componentId: "A", extra: 0 });
    expect(session.export()).toBe(before);
    expect(session.canUndo).toBe(false);
    session.apply({ type: "move-series-equivalent", slot: chosen, componentId: "A", extra: 2 });
    expect(session.document.attachmentSides).toEqual([{ componentId: "A", side: "left" }]);
    expect(session.document.topology.components.find(({ id }) => id === "A")?.parameters.ohm).toBe(4);
    expect(session.undo()).toBe(true);
    session.apply({ type: "move-series-equivalent", slot: chosen, componentId: "A", extra: 0 });
    expect(session.canRedo).toBe(true);
    expect(session.export()).toBe(before);
  });

  it("keeps observation identity and protects a measured internal net from reduction", () => {
    const topology = chain([resistor("Ra", 2), resistor("Rb", 3)]);
    const measured = create(topology, ["Ra:b"]);
    expect(measured.reduction()).toMatchObject({ ok: true, topology: measured.document.topology });
    const unobserved = create(topology);
    const result = unobserved.reduction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.topology.components).toHaveLength(1);
      expect(result.topology.components[0]).toMatchObject({ kind: "r", parameters: { ohm: 5 } });
    }
    expect(unobserved.document.topology.components).toHaveLength(2);
  });
});
