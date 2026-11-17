import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "./document";
import { emptyDrawing, junctionAt, placeComponent, wireDrawing, type PartKind } from "./drawing";
import type { CircuitLaboratoryMode } from "./editor-mode";
import type { CircuitTopology } from "./topology";
import { analyzeLcTopology, type LcPortAnalysis } from "../models/reactive-lc-graph";

function bridgeDocument(): string {
  const positions: readonly [PartKind, number, number][] = [
    ["port", 270, 310], ["l", 150, 95], ["c", 390, 95],
    ["c", 150, 235], ["l", 390, 235], ["l", 270, 165],
  ];
  const henry: Record<string, number> = { L1: 0.02, L2: 0.03, L3: 0.01 };
  const farad: Record<string, number> = { C1: 50e-6, C2: 20e-6 };
  let drawing = positions.reduce((draft, [kind, x, y]) => placeComponent(draft, kind, { x, y }), emptyDrawing());
  drawing = {
    ...drawing,
    positions: { ...drawing.positions, L3: { ...drawing.positions.L3, rotation: 90 } },
    topology: {
      ...drawing.topology,
      components: drawing.topology.components.map(part => {
        if (part.kind === "l") return { ...part, parameters: { henry: henry[part.id], initial: 0 } };
        if (part.kind === "c") return { ...part, parameters: { farad: farad[part.id], initial: 0 } };
        return part;
      }),
    },
  };
  for (const [x, y] of [[60, 165], [480, 165], [270, 95], [270, 235]]) drawing = junctionAt(drawing, { x, y });
  for (const [from, to] of [
    ["P1:a", "J1"], ["P1:b", "J2"], ["J1", "L1:a"], ["L1:b", "J3"], ["J3", "C1:a"], ["C1:b", "J2"],
    ["J1", "C2:a"], ["C2:b", "J4"], ["J4", "L2:a"], ["L2:b", "J2"], ["J3", "L3:a"], ["L3:b", "J4"],
  ]) drawing = wireDrawing(drawing, from, to);
  return serializeCircuit(drawing, defaultCircuitSettings);
}

export function splitReactivePort(topology: CircuitTopology): { topology: CircuitTopology; port: readonly [string, string] } {
  const ports = topology.components.filter(part => part.kind === "port");
  if (ports.length !== 1) throw Error("invalid-lc-port");
  const [a, b] = ports[0].terminals;
  return {
    topology: {
      ...topology,
      components: topology.components.filter(part => part.kind !== "port"),
      junctions: [...topology.junctions, a, b],
    },
    port: [a, b],
  };
}

export const reactiveLcMode: CircuitLaboratoryMode<LcPortAnalysis> = {
  createDefaultDocument: bridgeDocument,
  example: { ru: "Асимметричный LC-мост", uk: "Асиметричний LC-міст" },
  availableParts: drawing => drawing.topology.components.some(part => part.kind === "port")
    ? ["l", "c"] : ["port", "l", "c"],
  readModel(document) {
    const { drawing } = parseCircuit(document);
    const { topology, port } = splitReactivePort(drawing.topology);
    return analyzeLcTopology(topology, port);
  },
};
