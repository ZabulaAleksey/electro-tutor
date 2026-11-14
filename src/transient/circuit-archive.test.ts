import { describe, expect, it } from "vitest";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "../circuit/document";
import { circuitToArchivedNetwork, networkToCircuit } from "./circuit-archive";
import { readLineArchive } from "./line-archive-document";
import { DEFAULT_DIODE } from "./line-diode";
import { DEFAULT_NETWORK, validateNetwork, type Network } from "./network";

const open = structuredClone(DEFAULT_NETWORK);
const reactive: Network = {
  ...open,
  sections: [{ ...open.sections[0], resistanceOhmM: 1e-6 }, { ...open.sections[0], id: "TL2", lengthM: 500_000 }],
  source: { voltageV: 0, currentA: .25, resistanceOhm: 0, node: 1, onS: 0 },
  series: [{ id: "COIL", from: 1, to: 3, component: { kind: "l", value: .001, initial: 0.03 } }],
  branches: [{ id: "D2", from: 2, to: "reference", component: { kind: "diode", diode: { ...DEFAULT_DIODE, reversed: true } } }],
  shunts: [{ node: 0, resistanceOhm: 205 }],
  load: { id: "Group", kind: "parallel", children: [
    { id: "C1", kind: "c", value: 1e-6, initial: 0.025 },
    { id: "Chain", kind: "series", children: [
      { id: "R1", kind: "r", value: 18 }, { id: "L1", kind: "l", value: 0.02 },
    ] },
  ] },
};
const scheduled: Network = { ...open,
  source: { ...open.source, onS: .001, offS: .018, resistanceOhm: 50 },
  load: { id: "Switch", kind: "switch", closed: false, children: [{ id: "LoadR", kind: "r", value: 50 }] },
  events: [
    { id: "on", target: "Switch", kind: "switch", value: 1, previous: 0, atS: .002 },
    { id: "change1", target: "LoadR", kind: "resistance", value: 75, previous: 50, atS: .006 },
    { id: "change2", target: "LoadR", kind: "resistance", value: 99, previous: 75, atS: .008 },
  ],
};
const bridge: Network = { ...open, sections: [...open.sections, { ...open.sections[0], id: "L2" }],
  load: { id: "Short", kind: "wire" },
  series: [{ id: "Key", from: 1, to: 3, resistanceOhm: 25, switch: { closed: true, atS: .01, closes: false } }],
  branches: [{ id: "Path", from: 0, to: 1 }],
};
describe("archive graph migration", () => {
  it.each([open, reactive, scheduled, bridge])("survives universal JSON without altering the physical model", model => {
    expect(validateNetwork(model)).toEqual([]);
    const drawing = networkToCircuit(model);
    const restored = parseCircuit(serializeCircuit(drawing, defaultCircuitSettings));
    expect(circuitToArchivedNetwork(restored.drawing)).toEqual(model);
    expect(restored.routing.unrouted).toEqual([]);
  });

  it("reads an edited parameter and refuses to reuse connectivity from disconnected pins", () => {
    const drawing = networkToCircuit(scheduled);
    const changed = { ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(part => part.id === "LoadR"
      ? { ...part, parameters: { ...part.parameters, ohm: 38 } } : part) } };
    expect(circuitToArchivedNetwork(changed).load.children?.[0].value).toBe(38);
    const broken = { ...drawing, topology: { ...drawing.topology, wires: drawing.topology.wires.filter(wire => wire.to !== "LoadR:a" && wire.from !== "LoadR:a") } };
    expect(() => circuitToArchivedNetwork(broken)).toThrow("archive-disconnected");
  });
});

it.each([2, 3, 4, 5])("migrates a supported v%s archive and recovers the same model", version => {
  const model = version === 5 ? reactive : version === 4 ? bridge : scheduled;
  const restored = readLineArchive(JSON.stringify({ schema: "electrotutor-line-v" + version, model }));
  expect(restored.model).toEqual(model);
  expect(circuitToArchivedNetwork(parseCircuit(restored.circuit!).drawing)).toEqual(model);
});

it("recovers detached component parameters and preserves the linked ink archive", () => {
  const detached = [{ id: "draft-1", kind: "r", x: 250, y: 280, rotation: 90, template: { resistanceOhm: 420 } }];
  const ink = [[[{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }]]];
  const inkLinks = [{ target: { kind: "detached", id: "draft-1" }, kind: "r" }];
  const restored = readLineArchive(JSON.stringify({
    schema: "electrotutor-line-v5", model: open, detached, ink, inkLinks,
  }));
  const drawing = parseCircuit(restored.circuit!).drawing;
  expect(drawing.topology.components.find(part => part.id === "draft-1")?.parameters).toEqual({ ohm: 420 });
  expect(drawing.positions["draft-1"]).toEqual({ x: 250, y: 280, rotation: 90 });
  expect(restored.ink).toEqual(ink);
  expect(restored.inkLinks).toEqual(inkLinks);
  expect(circuitToArchivedNetwork(drawing)).toEqual(open);
});

it("projects a parallel ideal branch onto separate wires and keeps its original model", () => {
  const model: Network = { ...open, branches: [{ id: "W1", from: 0, to: 1 }] };
  const restored = readLineArchive(JSON.stringify({ schema: "electrotutor-line-v4", model }));
  expect(restored.circuit).toBeDefined();
  expect(circuitToArchivedNetwork(parseCircuit(restored.circuit!).drawing)).toEqual(model);
});

it("keeps the angle, span and physical length of an archived handwritten line", () => {
  const layout = { TL1: 240, "@x-TL1": 185, "@span-TL1": 83, "@rot-TL1": 10.44 };
  const restored = readLineArchive(JSON.stringify({ schema: "electrotutor-line-v5", model: open, layout }));
  const { drawing, routing } = parseCircuit(restored.circuit);
  expect(drawing.positions.TL1).toMatchObject({ x: 330, y: 261, span: 166, rotation: expect.closeTo(10.44) });
  expect(routing.unrouted).toEqual([]);
  expect(circuitToArchivedNetwork(drawing)).toEqual(open);
});

it("projects six sections with an inline key, multiple branches and a nested terminal network", () => {
  const model: Network = {
    ...open,
    sections: Array.from({ length: 6 }, (_, index) => ({ ...open.sections[0], id: "TL" + (index + 1) })),
    series: [{ id: "Key", from: 3, to: 9, switch: { closed: true, atS: .01, closes: false } }],
    branches: Array.from({ length: 5 }, (_, index) => ({ id: "B" + index, from: index, to: "reference", resistanceOhm: 100 })),
    load: { id: "P", kind: "parallel", children: [
      { id: "RS", kind: "series", children: Array.from({ length: 4 }, (_, index) => ({ id: "R" + index, kind: "r", value: 50 })) },
      { id: "RO", kind: "r", value: 75 },
    ] },
  };
  expect(validateNetwork(model)).toEqual([]);
  const restored = parseCircuit(serializeCircuit(networkToCircuit(model), defaultCircuitSettings));
  expect(circuitToArchivedNetwork(restored.drawing)).toEqual(model);
});
