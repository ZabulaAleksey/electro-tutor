import { canPlace, parts, type Drawing, type PartKind, type Placement, type Point } from "./drawing";
import { clearGeometry, routeDrawing, type Routing } from "./routing";
import { validateCircuit, type CircuitTopology } from "./topology";

export type CircuitSettings = { grid: number; showGrid: boolean; zigzag: boolean; snap: boolean };
export const defaultCircuitSettings: CircuitSettings = { grid: 10, showGrid: false, zigzag: false, snap: true };
export const maxCircuitFileBytes = 160_000;

export type CircuitDocument = {
  schemaVersion: 2;
  topology: CircuitTopology;
  geometry: { positions: Record<string, Placement>; junctionPositions: Record<string, Point> };
  metadata: { title: string };
  settings: CircuitSettings;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function parsePoint(value: unknown): Point {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number" ||
    !Number.isFinite(value.x) || !Number.isFinite(value.y) ||
    value.x < 40 || value.x > 500 || value.y < 40 || value.y > 320) throw Error("invalid-position");
  return { x: value.x, y: value.y };
}

export function serializeCircuit(drawing: Drawing, settings: CircuitSettings, title = ""): string {
  const document: CircuitDocument = {
    schemaVersion: 2, topology: drawing.topology,
    geometry: { positions: drawing.positions, junctionPositions: drawing.junctionPositions },
    metadata: { title }, settings,
  };
  const text = JSON.stringify(document, null, 2);
  if (new TextEncoder().encode(text).length > maxCircuitFileBytes) throw Error("file-limit");
  return text;
}

export function parseCircuit(text: string): { drawing: Drawing; settings: CircuitSettings; routing: Routing; title: string } {
  if (new TextEncoder().encode(text).length > maxCircuitFileBytes) throw Error("file-limit");
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) throw Error("unsupported-version");
  const { topology, geometry, metadata } = value;
  const settings = value.schemaVersion === 1 && isRecord(value.settings)
    ? { ...value.settings, snap: true } : value.settings;
  if (validateCircuit(topology).length || !isRecord(geometry) || !isRecord(geometry.positions) ||
    !isRecord(geometry.junctionPositions) || !isRecord(settings) || !isRecord(metadata) ||
    typeof metadata.title !== "string" || metadata.title.length > 120) throw Error("invalid-document");
  const graph = topology as CircuitTopology;
  if (graph.components.length > 64 || graph.junctions.length > 80 || graph.wires.length > 128 ||
    Object.keys(geometry.positions).length !== graph.components.length ||
    Object.keys(geometry.junctionPositions).length !== graph.junctions.length) throw Error("invalid-document");
  const grid = settings.grid;
  if (typeof grid !== "number" || ![5, 10, 20].includes(grid) ||
    typeof settings.showGrid !== "boolean" || typeof settings.zigzag !== "boolean" || typeof settings.snap !== "boolean") throw Error("invalid-settings");
  const drawing: Drawing = { topology: graph, positions: Object.create(null), junctionPositions: Object.create(null) };
  for (const component of graph.components) {
    if (!Object.hasOwn(parts, component.kind) || component.terminals.length !== 2) throw Error("unsupported-component");
    const defaults = parts[component.kind as PartKind].parameters;
    const entries = Object.entries(component.parameters);
    if (entries.length !== Object.keys(defaults).length || entries.some(([key, parameter]) =>
      !Object.hasOwn(defaults, key) || typeof parameter !== typeof (defaults as Record<string, unknown>)[key] ||
      (typeof parameter === "number" && key !== "voltageV" && key !== "currentA" && parameter <= 0))) {
      throw Error("invalid-parameter");
    }
    const raw = geometry.positions[component.id];
    const point = parsePoint(raw);
    if (!isRecord(raw) || typeof raw.rotation !== "number" || ![0, 90, 180, 270].includes(raw.rotation)) {
      throw Error("invalid-rotation");
    }
    const span = raw.span;
    if (span !== undefined && (component.kind !== "line" || typeof span !== "number" ||
      !Number.isFinite(span) || span < 60 || span > 460)) throw Error("invalid-line-span");
    const pinned = raw.pinned;
    if (pinned !== undefined && typeof pinned !== "boolean") throw Error("invalid-pin");
    drawing.positions[component.id] = {
      ...point, rotation: raw.rotation,
      ...(span === undefined ? {} : { span }), ...(pinned === undefined ? {} : { pinned }),
    };
  }
  for (const id of graph.junctions) {
    const point = parsePoint(geometry.junctionPositions[id]);
    if (!canPlace({ ...drawing, positions: {} }, point, undefined, 4) ||
      Object.values(drawing.positions).some(p => Math.abs(p.x - point.x) < 40 && Math.abs(p.y - point.y) < 40)) {
      throw Error("junction-overlap");
    }
    drawing.junctionPositions[id] = point;
  }
  if (!clearGeometry(drawing)) throw Error("invalid-geometry");
  const routing = routeDrawing(drawing);
  if (routing.unrouted.length) throw Error("unroutable-document");
  return { drawing, routing, settings: { grid, showGrid: settings.showGrid, zigzag: settings.zigzag, snap: settings.snap }, title: metadata.title };
}
