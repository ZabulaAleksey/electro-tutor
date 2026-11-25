import { describe, expect, it } from "vitest";
import { parts } from "../../src/circuit/drawing";
import { netlist, type CircuitTopology, type CircuitWire } from "../../src/circuit/topology";
import { TopologySession, type TopologyCommand } from "../../src/circuit/topology-session";
import { newLineExperiment } from "../../src/transient/line-experiment";

type Model = {
  wires: readonly CircuitWire[];
  opened: readonly CircuitWire[];
  inserted: boolean;
  cleared: boolean;
};

const initial = newLineExperiment().circuit;
const resistor = { id: "R1", kind: "r", terminals: ["R1:a", "R1:b"], parameters: parts.r.parameters };
const conductor = { id: "W2", from: "K1:b", to: "TL1:a" };
const firstHalf = { id: "W2", from: conductor.from, to: resistor.terminals[0] };
const secondHalf = { id: "slotWire1", from: resistor.terminals[1], to: conductor.to };

function expectedNets(points: readonly string[], wires: readonly CircuitWire[]) {
  const remaining = new Set(points);
  const result: string[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first);
    const connected = [first];
    for (let index = 0; index < connected.length; index++) {
      const endpoint = connected[index];
      for (const { from, to } of wires) {
        const adjacent = from === endpoint ? to : to === endpoint ? from : undefined;
        if (adjacent && remaining.delete(adjacent)) connected.push(adjacent);
      }
    }
    result.push(connected.sort());
  }
  return result;
}

function deterministic(seed: number) {
  let state = seed;
  return (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * count);
  };
}

function ordered(wires: readonly CircuitWire[]) {
  return [...wires].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function checkGraph(graph: CircuitTopology, model: Model) {
  expect(ordered(graph.wires)).toEqual(ordered(model.wires));
  const base = model.cleared ? [] : initial.topology.components.flatMap(part => part.terminals);
  const points = model.inserted ? [...base, ...resistor.terminals] : base;
  expect(netlist(graph).map(net => net.join("|")).sort()).toEqual(expectedNets(points, model.wires).map(net => net.join("|")).sort());
}

describe("EVAL-03 · transactional electrical history", () => {
  it("matches an independent connectivity oracle across 100 seeds with 100 edits each", () => {
    const actions = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const random = deterministic(seed);
      const session = new TopologySession(JSON.stringify(initial));
      let model: Model = { wires: initial.topology.wires, opened: [], inserted: false, cleared: false };
      let past: Model[] = [];
      let future: Model[] = [];

      function commit(command: TopologyCommand, expected: Model) {
        actions.add(command.type);
        session.apply(command);
        past = [...past, model].slice(-64);
        future = [];
        model = expected;
      }

      for (let step = 0; step < 100; step++) {
        const action = model.cleared ? 0 : random(8);
        const available = model.wires.some(wire => wire.id === conductor.id);
        switch (action) {
          case 0: {
            const previous = past.pop();
            expect(session.undo()).toBe(!!previous);
            if (previous) {
              future = [model, ...future]; model = previous;
              actions.add("undo");
            }
            break;
          }
          case 1: {
            const next = future.shift();
            expect(session.redo()).toBe(!!next);
            if (next) {
              past.push(model); model = next;
              actions.add("redo");
            }
            break;
          }
          case 2:
            if (model.wires.length) {
              const wire = model.wires[random(model.wires.length)];
              commit({ type: "break-wire", wireId: wire.id }, {
                ...model, wires: model.wires.filter(item => item.id !== wire.id), opened: [...model.opened, wire],
              });
            }
            break;
          case 3:
            if (model.opened.length) {
              const wire = model.opened[random(model.opened.length)];
              commit({ type: "restore-wire", wireId: wire.id }, {
                ...model, opened: model.opened.filter(item => item.id !== wire.id), wires: [...model.wires, wire],
              });
            }
            break;
          case 4:
            if (!model.inserted && available) {
              const slot = session.listSlots().find(item => item.kind === "series" && item.wireId === conductor.id)!;
              commit({ type: "insert", slot, component: resistor }, {
                ...model, wires: [...model.wires.filter(wire => wire.id !== conductor.id), firstHalf, secondHalf], inserted: true,
              });
            }
            break;
          case 5:
            if (model.inserted && available && model.wires.some(wire => wire.id === secondHalf.id)) {
              commit({ type: "remove", componentId: resistor.id, mode: "conductor" }, {
                ...model, wires: [...model.wires.filter(wire => wire.id !== firstHalf.id && wire.id !== secondHalf.id), conductor],
                inserted: false,
              });
            }
            break;
          case 6:
            if (step % 7 === 0) commit({ type: "clear", retainedIds: [] }, { wires: [], opened: [], inserted: false, cleared: true });
            break;
          case 7: {
            const before = session.export();
            expect(() => session.apply({ type: "restore-wire", wireId: "missing-wire" })).toThrow("unknown-broken-wire");
            expect(session.export()).toBe(before);
            actions.add("rejected");
            break;
          }
        }
        checkGraph(session.document.topology, model);
        expect(session.canUndo).toBe(past.length > 0);
        expect(session.canRedo).toBe(future.length > 0);
        expect(ordered(session.document.brokenWires ?? [])).toEqual(ordered(model.opened));
        expect(session.document.schemaVersion).toBe(model.opened.length ? 2 : 1);
        const restored = new TopologySession(session.export());
        expect(restored.document).toEqual(session.document);
      }
    }
    expect([...actions].sort()).toEqual(["break-wire", "clear", "insert", "redo", "rejected", "remove", "restore-wire", "undo"]);
  }, 30_000);

  it("reserves a cut ID when adding another component and reads old version-one archives", () => {
    const session = new TopologySession(JSON.stringify(initial));
    const slotW2 = session.listSlots().find(item => item.kind === "series" && item.wireId === "W2")!;
    session.apply({ type: "insert", slot: slotW2, component: resistor });
    session.apply({ type: "break-wire", wireId: "slotWire1" });
    expect(session.document.brokenWires).toEqual([secondHalf]);

    const slotW3 = session.listSlots().find(item => item.kind === "series" && item.wireId === "W3")!;
    const other = { ...resistor, id: "R2", terminals: ["R2:a", "R2:b"] };
    session.apply({ type: "insert", slot: slotW3, component: other });
    expect(session.document.topology.wires.some(wire => wire.id === secondHalf.id)).toBe(false);
    const loaded = new TopologySession(session.export());
    loaded.apply({ type: "restore-wire", wireId: "slotWire1" });
    expect(loaded.document.topology.wires).toContainEqual(secondHalf);
    expect(loaded.document.topology.components).toContainEqual(other);
    expect(loaded.document.schemaVersion).toBe(1);
    expect(loaded.document.brokenWires).toBeUndefined();
  });

  it("keeps a reserved open-wire ID when removing an adjacent device reconnects surviving terminals", () => {
    const secondResistor = { ...resistor, id: "R2", terminals: ["R2:a", "R2:b"] };
    const port = { id: "P1", kind: "port", terminals: ["P1:a", "P1:b"], parameters: parts.port.parameters };
    const open = { id: "W4", from: "R2:b", to: "P1:b" };
    const session = new TopologySession(JSON.stringify({
      ...initial,
      schemaVersion: 2,
      topology: { components: [port, resistor, secondResistor], junctions: [], wires: [
        { id: "W1", from: "P1:a", to: "R1:a" },
        { id: "W2", from: "R2:a", to: "R1:a" },
        { id: "W3", from: "R1:b", to: "R2:b" },
      ] },
      brokenWires: [open],
    }));
    session.apply({ type: "remove", componentId: "R1", mode: "device" });
    expect(session.document.brokenWires).toEqual([open]);
    expect(session.document.topology.wires).toEqual([{ id: "W5", from: "P1:a", to: "R2:a" }]);
    session.apply({ type: "restore-wire", wireId: "W4" });
    expect(session.document.topology.wires).toContainEqual(open);
  });
});
