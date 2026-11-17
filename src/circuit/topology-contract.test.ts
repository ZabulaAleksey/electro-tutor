import { expect, it } from "vitest";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "./document";
import { demoDrawing, emptyDrawing, junctionAt, lineDemoDrawing, placeComponent } from "./drawing";
import { netlist } from "./topology";

function asV1(text: string): string {
  const document = JSON.parse(text);
  document.schemaVersion = 1;
  delete document.settings.snap;
  return JSON.stringify(document);
}

for (const [name, source] of [["RLC", demoDrawing()], ["long-line", lineDemoDrawing()]] as const) {
  it(`${name} preserves electrical identity through v1/v2 import and v2 export`, () => {
    const v2 = serializeCircuit(source, { ...defaultCircuitSettings, snap: false }, name);
    const originalNets = netlist(source.topology);
    for (const [text, snap] of [[asV1(v2), true], [v2, false]] as const) {
      const loaded = parseCircuit(text);
      const exported = serializeCircuit(loaded.drawing, loaded.settings, loaded.title);
      const reopened = parseCircuit(exported);

      expect(JSON.parse(exported).schemaVersion).toBe(2);
      expect(reopened.settings.snap).toBe(snap);
      expect(loaded.drawing.topology).toEqual(source.topology);
      expect(reopened.drawing.topology).toEqual(source.topology);
      expect(netlist(reopened.drawing.topology)).toEqual(originalNets);
      expect(reopened.routing.unrouted).toEqual([]);
    }
  });
}

it("preserves an explicit junction and disconnected terminals as distinct nets", () => {
  const part = placeComponent(emptyDrawing(), "r", { x: 120, y: 120 });
  const source = junctionAt(part, { x: 360, y: 120 });
  const reopened = parseCircuit(serializeCircuit(source, defaultCircuitSettings));

  expect(reopened.drawing.topology).toEqual(source.topology);
  expect(netlist(reopened.drawing.topology)).toEqual([["J1"], ["R1:a"], ["R1:b"]]);
});

it("reroutes an independent geometry edit without changing electrical topology", () => {
  const source = demoDrawing();
  const original = parseCircuit(serializeCircuit(source, defaultCircuitSettings));
  const moved = { ...source, positions: { ...source.positions, R1: { ...source.positions.R1, y: 110 } } };
  const reopened = parseCircuit(serializeCircuit(moved, defaultCircuitSettings));

  expect(reopened.drawing.topology).toEqual(source.topology);
  expect(netlist(reopened.drawing.topology)).toEqual(netlist(source.topology));
  expect(reopened.drawing.positions.R1).toMatchObject({ x: 210, y: 110 });
  expect(reopened.routing.paths).not.toEqual(original.routing.paths);
  expect(reopened.routing.unrouted).toEqual([]);
});
