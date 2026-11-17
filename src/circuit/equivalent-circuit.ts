import { defaultBoard, type Drawing, type Placement, type Point } from "./drawing";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "./document";
import { clearGeometry, routeDrawing, type Routing } from "./routing";
import { netlist, type CircuitComponent, type CircuitTopology } from "./topology";
import { reduceRlc, type RlcEquivalent } from "./rlc-reduction";
import type { CircuitEditorMode } from "./editor-mode";

export type EquivalentMode = "transient" | "steady";
export type EquivalentFailureReason =
  | "unsupported-mode" | "mutual-coupling-unsupported" | "no-reduction"
  | "reduction-conflict" | "invalid-topology" | "layout-failed";

export type ProvenanceNode = {
  id: string;
  polarity: 1 | -1;
  kind: string;
  value?: number;
  connection?: "series" | "parallel";
  members?: readonly ProvenanceNode[];
};

export type EquivalentSuccess = {
  ok: true;
  mode: EquivalentMode;
  drawing: Drawing;
  routing: Routing;
  document: string;
  equivalents: ReadonlyMap<string, RlcEquivalent>;
  provenance: readonly ProvenanceNode[];
  assumptions: readonly string[];
};

export type EquivalentFailure = {
  ok: false;
  reason: EquivalentFailureReason;
  components: readonly string[];
  nets: readonly (readonly string[])[];
  conflict?: { kind: "l" | "c"; connection: "series" | "parallel"; components: readonly string[] };
};

export type EquivalentResult = EquivalentSuccess | EquivalentFailure;

export function equivalentMode(modeId: CircuitEditorMode["id"]): EquivalentMode | undefined {
  if (modeId === "free") return "transient";
  if (modeId === "transient-line") return "transient";
  if (modeId === "steady-line" || modeId === "reactive-lc") return "steady";
  return undefined;
}

function componentValue(component: CircuitComponent): number | undefined {
  const key = component.kind === "r" ? "ohm" : component.kind === "l" ? "henry" : component.kind === "c" ? "farad" : undefined;
  const value = key ? component.parameters[key] : undefined;
  return typeof value === "number" ? value : undefined;
}

function membersOf(id: string, map: ReadonlyMap<string, RlcEquivalent>): string[] {
  const equation = map.get(id);
  return equation ? equation.members.flatMap(member => membersOf(member.id, map)) : [id];
}

function provenanceOf(id: string, map: ReadonlyMap<string, RlcEquivalent>, components: ReadonlyMap<string, CircuitComponent>, polarity: 1 | -1 = 1): ProvenanceNode {
  const equation = map.get(id);
  if (!equation) {
    const source = components.get(id);
    return { id, polarity, kind: source?.kind ?? "unknown", value: source ? componentValue(source) : undefined };
  }
  return {
    id, polarity, kind: equation.kind, value: equation.value, connection: equation.connection,
    members: equation.members.map(member => provenanceOf(member.id, map, components, (polarity * member.polarity) as 1 | -1)),
  };
}

function positionsFor(drawing: Drawing, topology: CircuitTopology, equations: ReadonlyMap<string, RlcEquivalent>): Record<string, Placement> {
  const positions: Record<string, Placement> = Object.create(null);
  const source = new Map(Object.entries(drawing.positions));
  topology.components.forEach(component => {
    const original = source.get(component.id);
    if (original) positions[component.id] = { ...original };
  });
  const board = drawing.board ?? defaultBoard;
  const pointFor = (id: string): Point => {
    const points = membersOf(id, equations).map(member => source.get(member)).filter((point): point is Placement => !!point);
    if (points.length) return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    return { x: board.width / 2, y: board.height / 2 };
  };
  const offsets = [
    [0, 0], [80, 0], [-80, 0], [0, 80], [0, -80], [160, 0], [-160, 0], [0, 160], [0, -160],
    [80, 80], [-80, 80], [80, -80], [-80, -80], [160, 80], [-160, 80], [160, -80], [-160, -80],
  ] as const;
  topology.components.filter(component => !positions[component.id]).forEach((component, index) => {
    const base = pointFor(component.id);
    const [dx, dy] = offsets[index % offsets.length];
    const x = Math.max(40, Math.min(board.width - 40, base.x + dx));
    const y = Math.max(40, Math.min(board.height - 40, base.y + dy));
    positions[component.id] = { x, y, rotation: 0 };
  });
  return positions;
}

function junctionsFor(drawing: Drawing, topology: CircuitTopology): Record<string, Point> {
  const result: Record<string, Point> = Object.create(null);
  const source = drawing.junctionPositions;
  const board = drawing.board ?? defaultBoard;
  topology.junctions.forEach((id, index) => {
    result[id] = source[id] ?? { x: Math.max(40, Math.min(board.width - 40, 80 + (index % 6) * 80)), y: Math.max(40, Math.min(board.height - 40, 80 + Math.floor(index / 6) * 80)) };
  });
  return result;
}

function makeDrawing(source: Drawing, topology: CircuitTopology, equations: ReadonlyMap<string, RlcEquivalent>): Drawing | undefined {
  const drawing: Drawing = {
    topology, positions: positionsFor(source, topology, equations), junctionPositions: junctionsFor(source, topology),
    ...(source.board ? { board: { ...source.board } } : {}),
  };
  if (Object.keys(drawing.positions).length !== topology.components.length ||
      Object.keys(drawing.junctionPositions).length !== topology.junctions.length || !clearGeometry(drawing)) return undefined;
  const routing = routeDrawing(drawing);
  if (routing.unrouted.length) return undefined;
  return drawing;
}

export function deriveEquivalent(drawing: Drawing, modeId: CircuitEditorMode["id"], mutualCoupling = false, requestedMode?: EquivalentMode): EquivalentResult {
  const mode = requestedMode ?? equivalentMode(modeId);
  let nets: readonly (readonly string[])[] = [];
  try { nets = netlist(drawing.topology); } catch { return { ok: false, reason: "invalid-topology", components: [], nets }; }
  const components = drawing.topology.components.map(component => component.id);
  if (!mode) return { ok: false, reason: "unsupported-mode", components, nets };
  if (mutualCoupling) return { ok: false, reason: "mutual-coupling-unsupported", components, nets };
  const input: CircuitTopology = mode === "steady" ? {
    ...drawing.topology,
    components: drawing.topology.components.map(component => component.kind === "l" || component.kind === "c"
      ? { ...component, parameters: { ...component.parameters, initial: 0 } } : component),
  } : drawing.topology;
  let reduction;
  try { reduction = reduceRlc(input); } catch { return { ok: false, reason: "invalid-topology", components, nets }; }
  if (!reduction.ok) return { ok: false, reason: "reduction-conflict", components: reduction.conflict.components, nets, conflict: reduction.conflict };
  if (!reduction.equivalents.size) return { ok: false, reason: "no-reduction", components, nets };
  const reduced = makeDrawing(drawing, reduction.topology, reduction.equivalents);
  if (!reduced) return { ok: false, reason: "layout-failed", components, nets };
  const sourceComponents = new Map(drawing.topology.components.map(component => [component.id, component] as const));
  const provenance = [...reduction.equivalents.keys()].map(id => provenanceOf(id, reduction.equivalents, sourceComponents));
  try {
    const document = serializeCircuit(reduced, defaultCircuitSettings, "Equivalent circuit");
    parseCircuit(document);
    return {
      ok: true, mode, drawing: reduced, routing: routeDrawing(reduced), document,
      equivalents: reduction.equivalents, provenance,
      assumptions: mode === "transient" ? ["reactive-initial-state-preserved", "series-parallel-only"] : ["steady-state-zero-state", "series-parallel-only"],
    };
  } catch {
    return { ok: false, reason: "layout-failed", components, nets };
  }
}
