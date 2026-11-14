import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import type { Language } from "../types";
import { circuitCopy } from "./copy";
import { defaultCircuitSettings, maxCircuitFileBytes, parseCircuit, serializeCircuit, type CircuitSettings } from "./document";
import { canPlace, defaultBoard, demoDrawing, emptyDrawing, insertInWire, junctionAt, lineDemoDrawing, parts, placeComponent, placeLine, splitWireAt, validPartParameter, wireDrawing, type Drawing, type PartKind, type Point } from "./drawing";
import { clearGeometry, drawingPorts, optimizeDrawing, optimizeLayout, routeDrawing, type Routing } from "./routing";
import { disconnect, netlist, removeComponent, type Parameter } from "./topology";
import type { OptimizationRequest, OptimizationResult } from "./routing.worker";
import "./circuit-editor.css";

const storageKey = "electrotutor.circuit.v1";
type Snapshot = { drawing: Drawing; routing: Routing; settings: CircuitSettings; title: string };
type Gesture = { pointer: number; component: string | null; terminal: string | null; wire: string | null; start: Point; origin: Point };

function Glyph({ kind, span = 58, closed, reversed, ground }: { kind: PartKind; span?: number; closed?: boolean; reversed?: boolean; ground?: boolean }) {
  switch (kind) {
    case "line": return <g stroke="var(--ink)" fill="var(--white)" strokeWidth="1.7"><path d={`M${-span / 2} 0H${span / 2}`} /><rect className="network-transmission-stroke" x={-span / 2 + 8} y="-9" width={span - 16} height="18" rx="9" /><path d="M-12 0H12M7 -4L12 0L7 4" fill="none" /></g>;
    case "r": return <ResistorGlyph x={-29} y={0} />;
    case "l": return <InductorGlyph x={-27} y={0} />;
    case "c": return <CapacitorGlyph x={0} y={0} terminalSpan={54} orientation="horizontal" />;
    case "diode": return <g transform={reversed ? "scale(-1 1)" : undefined}><DiodeGlyph x={-11.5} y={0} /></g>;
    case "voltage":
    case "current": return <g transform="rotate(-90)"><SourceGlyph x={0} y={0} current={kind === "current"} /></g>;
    case "open": return <g stroke="var(--ink)" strokeWidth="1.7"><path d="M-24 0H-8M8 0H24" />
      <circle cx="-8" cy="0" r="2" fill="var(--white)" /><circle cx="8" cy="0" r="2" fill="var(--white)" /></g>;
    case "bridge": return <g stroke="var(--ink)" strokeWidth="1.7" fill="none"><path d="M-24 0H24" />
      {ground && <path data-symbol="ground" d="M0 0V9M-10 9H10M-6 13H6M-3 17H3" />}</g>;
    case "switch": return <path d={closed ? "M-24 0H24" : "M-24 0H-10L10 -10M10 0H24"}
      stroke="var(--ink)" strokeWidth="1.7" fill="none" />;
  }
}

export type CircuitReading = { voltage: string; current?: string };

export type CircuitBoardExtension = {
  controls?: (drawing: Drawing) => ReactNode;
  inspector?: (drawing: Drawing, selected: string | null) => ReactNode;
  overlay?: (drawing: Drawing) => ReactNode;
  onTap?: (point: Point, drawing: Drawing) => boolean;
  onSelect?: (id: string | null, drawing: Drawing) => void;
  describePart?: (id: string, drawing: Drawing) => {
    "aria-label"?: string; "data-contact"?: string; "data-detached"?: string;
  };
  onCopy?: (id: string, drawing: Drawing, position: Point) => boolean;
  onCancel?: () => void;
  boardTool?: boolean;
  onBoardClick?: (id: string | null) => void;
  describeWire?: (id: string, drawing: Drawing) => { "data-load-lead"?: number };
  placing?: boolean;
  onHover?: (event: PointerEvent<SVGSVGElement>, point: Point | null) => void;
  groundPart?: (id: string) => boolean;
  partClosed?: (id: string, drawing: Drawing) => boolean | undefined;
  onStroke?: {
    start: (event: PointerEvent<SVGSVGElement>) => void;
    move: (event: PointerEvent<SVGSVGElement>) => void;
    finish: (event: PointerEvent<SVGSVGElement>) => void;
    cancel: (event: PointerEvent<SVGSVGElement>) => void;
  };
};

export default function CircuitEditor({ language, embedded = false, initial, activeDocument, onCalculate, readings,
  extension, onDocumentChange, onClear, history, initialSelection }: {
  language: Language;
  embedded?: boolean;
  initial?: string;
  activeDocument?: string;
  onCalculate?: (document: string) => void;
  readings?: ReadonlyMap<string, CircuitReading>;
  extension?: CircuitBoardExtension;
  onDocumentChange?: (document: string) => boolean;
  onClear?: () => void;
  initialSelection?: string;
  history?: { back: () => void; forward: () => void; canUndo: boolean; canRedo: boolean };
}) {
  const copy = circuitCopy(language);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    if (initial) return parseCircuit(initial);
    const drawing = emptyDrawing();
    return { drawing, routing: routeDrawing(drawing), settings: defaultCircuitSettings, title: "" };
  });
  const { drawing, routing, settings, title } = snapshot;
  const { width: boardWidth, height: boardHeight } = drawing.board ?? defaultBoard;
  const { grid, showGrid, zigzag, snap: alignToGrid } = settings;
  const importSequence = useRef(0);
  const undo = useRef<typeof snapshot[]>([]);
  const redo = useRef<typeof snapshot[]>([]);
  const [tool, setTool] = useState<PartKind | "wire" | "junction" | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelection ?? null);
  const [selectionWire, setSelectionWire] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(embedded);
  const [calculated, setCalculated] = useState(() => initial ? { topology: snapshot.drawing.topology, document: initial } : null);
  const [conflict, setConflict] = useState<"collision" | "routeError" | "fileError" | "saved" | null>(null);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [wireStart, setWireStart] = useState<string | null>(null);
  const ports = useMemo(() => drawingPorts(drawing), [drawing]);
  const [preview, setPreview] = useState<(Point & { id: string }) | null>(null);
  const previewDrawing = useMemo(() => preview ? { ...drawing, positions: { ...drawing.positions,
    [preview.id]: { ...drawing.positions[preview.id], x: preview.x, y: preview.y },
  } } : null, [drawing, preview]);
  const previewRoutes = useMemo(() => previewDrawing && clearGeometry(previewDrawing)
    ? routeDrawing(previewDrawing, previewDrawing.topology.wires, routing) : null, [previewDrawing, routing]);
  const nets = useMemo(() => netlist(drawing.topology), [drawing.topology]);
  function commit(next: Drawing, supplied?: Routing) {
    if (!clearGeometry(next)) {
      setConflict("collision");
      return false;
    }
    const planned = supplied ?? routeDrawing(next, next.topology.wires, routing);
    if (planned.unrouted.length) {
      setConflict("routeError");
      return false;
    }
    if (next === drawing && planned === routing) return true;
    return record({ ...snapshot, drawing: next, routing: planned });
  }
  function record(next: Snapshot) {
    stopOptimization();
    if (onDocumentChange) {
      try {
        const document = serializeCircuit(next.drawing, next.settings, next.title);
        if (onDocumentChange(document)) setCalculated({ topology: next.drawing.topology, document });
      } catch {
        setConflict("fileError");
        return false;
      }
    }
    importSequence.current++;
    undo.current = [...undo.current.slice(-79), snapshot];
    redo.current = [];
    setSnapshot(next);
    setConflict(null);
    return true;
  }
  function updateSettings<Setting extends keyof CircuitSettings>(key: Setting, value: CircuitSettings[Setting]) {
    if (settings[key] !== value) record({ ...snapshot, settings: { ...settings, [key]: value } });
  }
  function travel(back: boolean) {
    if (history) {
      chooseTool(null);
      extension?.onCancel?.();
      (back ? history.back : history.forward)();
      return;
    }
    const source = back ? undo.current : redo.current;
    const target = back ? redo.current : undo.current;
    const previous = source.pop();
    if (!previous) return;
    importSequence.current++;
    target.push(snapshot);
    chooseTool(null);
    setSnapshot(previous);
    onDocumentChange?.(serializeCircuit(previous.drawing, previous.settings, previous.title));
  }
  function choose(endpoint: string) {
    if (!wireStart) return setWireStart(endpoint);
    if (wireStart === endpoint) return setWireStart(null);
    try {
      if (commit(wireDrawing(drawing, wireStart, endpoint))) setWireStart(null);
    } catch {
      setConflict("routeError");
    }
  }
  function select(id: string | null) {
    setSelected(id);
    extension?.onSelect?.(id, drawing);
  }
  function chooseTool(next: typeof tool) {
    stopOptimization();
    gesture.current = null;
    setPreview(null);
    setTool(next);
    setLineStart(null);
    select(null);
    setSelectionWire(null);
    setWireStart(null);
    setConflict(null);
  }
  const drawingLayer = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  function touchDistance() {
    const [first, second] = touches.current.values();
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  }
  const fileInput = useRef<HTMLInputElement>(null);
  const clipboard = useRef<string | null>(null);
  const confirmClear = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const optimization = useRef<Worker | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  useEffect(() => () => optimization.current?.terminate(), []);
  function stopOptimization() {
    if (!optimization.current) return;
    optimization.current.terminate();
    optimization.current = null;
    setOptimizing(false);
  }
  function optimize(layout: boolean) {
    stopOptimization();
    if (drawing.topology.wires.length <= 12 && drawing.topology.components.length <= 12) {
      const plan = layout ? optimizeLayout(drawing, routing, grid) : { drawing, routing: optimizeDrawing(drawing, routing) };
      commit(plan.drawing, plan.routing);
      return;
    }
    try {
      const worker = new Worker(new URL("./routing.worker.ts", import.meta.url), { type: "module" });
      optimization.current = worker;
      setOptimizing(true);
      worker.onmessage = (event: MessageEvent<OptimizationResult>) => {
        if (optimization.current !== worker) return;
        stopOptimization();
        const result = event.data;
        if ("error" in result) { setConflict("routeError"); return; }
        commit({ ...result.drawing, topology: drawing.topology }, result.routing);
      };
      worker.onerror = () => {
        if (optimization.current !== worker) return;
        stopOptimization();
        setConflict("routeError");
      };
      worker.postMessage({ drawing, routing, grid, layout } satisfies OptimizationRequest);
    } catch {
      stopOptimization();
      setConflict("routeError");
    }
  }
  const zoomAnchor = useRef<{ client: DOMPoint; anchor: DOMPoint } | null>(null);
  useLayoutEffect(() => {
    const container = viewportRef.current;
    const matrix = drawingLayer.current?.getScreenCTM();
    const pending = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!container || !matrix || !pending) return;
    const position = pending.anchor.matrixTransform(matrix);
    container.scrollTo(container.scrollLeft + position.x - pending.client.x,
      container.scrollTop + position.y - pending.client.y);
  }, [zoom]);
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        if (embedded && event.deltaY && !event.deltaX && !event.shiftKey) {
          event.preventDefault();
          const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * window.innerHeight : event.deltaY;
          window.scrollBy({ top: delta, behavior: "instant" });
        }
        return;
      }
      event.preventDefault();
      const matrix = drawingLayer.current?.getScreenCTM();
      if (!matrix) return;
      const client = new DOMPoint(event.clientX, event.clientY);
      const anchor = client.matrixTransform(matrix.inverse());
      const next = Math.max(1, Math.min(2.5, zoom * Math.exp(-event.deltaY * .0015)));
      if (next === zoom) return;
      zoomAnchor.current = { client, anchor };
      setZoom(next);
    };
    container.addEventListener("wheel", wheel, { passive: false });
    return () => container.removeEventListener("wheel", wheel);
  }, [embedded, zoom]);
  useEffect(() => {
    if (embedded) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        setSnapshot(parseCircuit(saved));
      }
    } catch {
      setConflict("fileError");
    }
    setReady(true);
  }, [embedded]);

  function serialized() {
    return serializeCircuit(drawing, settings, title);
  }
  function saveLocal() {
    try {
      window.localStorage.setItem(storageKey, serialized());
      setConflict("saved");
    } catch {
      setConflict("fileError");
    }
  }
  function exportFile() {
    try {
      const url = URL.createObjectURL(new Blob([serialized()], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "circuit.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setConflict("fileError");
    }
  }
  async function importFile(file: File) {
    const sequence = ++importSequence.current;
    try {
      if (file.size > maxCircuitFileBytes) throw Error("file-limit");
      const parsed = parseCircuit(await file.text());
      if (sequence !== importSequence.current) return;
      record(parsed);
      chooseTool(null);
    } catch {
      if (sequence === importSequence.current) setConflict("fileError");
    }
  }

  function point(event: PointerEvent<SVGSVGElement>) {
    const matrix = drawingLayer.current?.getScreenCTM();
    if (!matrix) return null;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x, y };
  }

  function snap(at: Point) {
    const snapAxis = (value: number, max: number) => !alignToGrid ? Math.max(40, Math.min(max - 40, Math.round(value))) : grid * Math.max(
      Math.ceil(40 / grid), Math.min(Math.floor((max - 40) / grid), Math.round(value / grid)),
    );
    return { x: snapAxis(at.x, boardWidth), y: snapAxis(at.y, boardHeight) };
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size >= 2) {
        event.currentTarget.setPointerCapture(event.pointerId);
        if (!pinch.current) pinch.current = { distance: Math.max(1, touchDistance()), zoom };
        gesture.current = null;
        setPreview(null);
        return;
      }
    }
    if (event.button !== 0 || gesture.current) return;
    const at = point(event);
    if (!at) return;
    stopOptimization();
    const element = event.target as Element;
    if (element.closest("[data-line-start]") && tool !== "wire") return;
    const terminal = element.closest("[data-circuit-terminal]")?.getAttribute("data-circuit-terminal") ?? null;
    const wire = element.closest("[data-circuit-wire]")?.getAttribute("data-circuit-wire") ?? null;
    const target = element.closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
    gesture.current = {
      pointer: event.pointerId, component: target, terminal, wire, start: at, origin: target ? drawing.positions[target] : at,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setConflict(null);
    if (target) setSelectionWire(null);
  }

  function drag(event: PointerEvent<SVGSVGElement>) {
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch.current && touches.current.size >= 2) {
        setZoom(Math.max(1, Math.min(2, pinch.current.zoom * touchDistance() / pinch.current.distance)));
        return;
      }
    }
    const held = gesture.current;
    const at = point(event);
    if (!held) extension?.onHover?.(event, at);
    if (tool === "wire" || !held?.component || drawing.positions[held.component].pinned || held.pointer !== event.pointerId || !at) return;
    if (Math.hypot(at.x - held.start.x, at.y - held.start.y) < 4) {
      setPreview(null);
      return;
    }
    const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
    setPreview(point => point?.id === held.component && point.x === destination.x && point.y === destination.y
      ? point : { id: held.component!, ...destination });
    const id = held.component;
    const candidate = { ...drawing, positions: { ...drawing.positions,
      [id]: { ...drawing.positions[id], ...destination },
    } };
    setConflict(clearGeometry(candidate) ? null : "collision");
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    const wasPinching = pinch.current !== null;
    releaseTouch(event.pointerId);
    if (wasPinching) return;
    const held = gesture.current;
    const at = point(event);
    if (!held || held.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (!at) return;
    const moved = Math.hypot(at.x - held.start.x, at.y - held.start.y) >= 4;
    if (!moved && extension?.onTap?.(at, drawing)) return;
    if (!moved) {
      extension?.onBoardClick?.(held.component);
      if (held.component) select(held.component);
    }
    if (tool === "wire") {
      if (!moved && held.terminal) choose(held.terminal);
      return;
    }
    if (held.component && moved && !drawing.positions[held.component].pinned) {
      const id = held.component;
      const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
      if (destination.x !== held.origin.x || destination.y !== held.origin.y) {
        commit({ ...drawing, positions: { ...drawing.positions, [id]: { ...drawing.positions[id], ...destination } } });
      }
    }
    if (!held.component && !moved) {
      select(null);
      if (!tool) { setSelectionWire(held.wire); return; }
      const destination = snap(at);
      if (tool === "junction") {
        let location = destination;
        if (held.wire) {
          const path = routing.paths[held.wire];
          const segment = path.slice(1).map((end, i) => [path[i], end]).find(([a, b]) =>
            a.x === b.x ? Math.abs(at.x - a.x) < 8 && destination.y > Math.min(a.y, b.y) && destination.y < Math.max(a.y, b.y) :
              Math.abs(at.y - a.y) < 8 && destination.x > Math.min(a.x, b.x) && destination.x < Math.max(a.x, b.x));
          if (!segment) return setConflict("routeError");
          const [a, b] = segment;
          location = a.x === b.x ? { x: a.x, y: destination.y } : { x: destination.x, y: a.y };
        }
        const blocked = Object.values(drawing.positions).some(p => Math.abs(p.x - location.x) < 40 && Math.abs(p.y - location.y) < 40);
        const coincides = [...ports.values()].some(({ pin }) => pin.x === location.x && pin.y === location.y);
        if (blocked || coincides) return setConflict("collision");
        const next = held.wire ? splitWireAt(drawing, held.wire, location) : junctionAt(drawing, location);
        if (commit(next)) setTool(null);
        return;
      }
      if (tool === "line") {
        if (!lineStart) { setLineStart(destination); return; }
        try {
          const next = placeLine(drawing, lineStart, destination);
          if (commit(next)) {
            setSelected(next.topology.components.at(-1)!.id);
            setLineStart(null);
          }
        } catch {
          setConflict("routeError");
        }
        return;
      }
      let next: Drawing;
      if (held.wire) {
        const path = routing.paths[held.wire];
        const margin = tool === "diode" ? 16 : 36;
        const segment = path.slice(1).map((b, i) => [path[i], b] as const).find(([a, b]) =>
          a.x === b.x ? Math.abs(a.x - at.x) < 8 && at.y >= Math.min(a.y, b.y) + margin && at.y <= Math.max(a.y, b.y) - margin :
            Math.abs(a.y - at.y) < 8 && at.x >= Math.min(a.x, b.x) + margin && at.x <= Math.max(a.x, b.x) - margin);
        if (!segment) return setConflict("routeError");
        const [a, b] = segment;
        const vertical = a.x === b.x;
        const onWire = vertical ? { x: a.x, y: destination.y } : { x: destination.x, y: a.y };
        if (!canPlace(drawing, onWire, undefined, tool === "diode" ? 53 : 76)) return setConflict("collision");
        const rotation = vertical ? (a.y < b.y ? 90 : 270) : (a.x < b.x ? 0 : 180);
        next = insertInWire(drawing, held.wire, tool, onWire, rotation);
      } else {
        if (!canPlace(drawing, destination)) return setConflict("collision");
        next = placeComponent(drawing, tool, destination);
      }
      if (!commit(next)) return;
      setSelected(next.topology.components.at(-1)!.id);
    }
  }

  function releaseTouch(pointer: number) {
    touches.current.delete(pointer);
    if (!touches.current.size) pinch.current = null;
  }

  function cancel(event: PointerEvent<SVGSVGElement>) {
    releaseTouch(event.pointerId);
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    setConflict(null);
  }

  function rotate() {
    if (!selected) return;
    const current = drawing.positions[selected];
    if (current.pinned) return;
    commit({ ...drawing, positions: {
      ...drawing.positions, [selected]: { ...current, rotation: (current.rotation + 90) % 360 },
    } });
  }

  function remove() {
    if (!selected) return;
    const positions = { ...drawing.positions };
    delete positions[selected];
    commit({ ...drawing, topology: removeComponent(drawing.topology, selected), positions });
    setSelected(null);
  }

  const selectedItem = drawing.topology.components.find(item => item.id === selected);
  const parameters = selectedItem ? Object.entries({ ...parts[selectedItem.kind as PartKind].parameters, ...selectedItem.parameters }) : [];
  function saveParameter(name: string, previous: Parameter, raw: string | boolean) {
    if (!selectedItem || typeof raw === "string" && !raw.trim()) return;
    const value = typeof raw === "boolean" ? raw : Number(raw);
    if (typeof value === "number" && !validPartParameter(name, value)) return;
    if (previous === value && Object.hasOwn(selectedItem.parameters, name)) return;
    commit({ ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(item =>
      item === selectedItem ? { ...item, parameters: { ...item.parameters, [name]: value } } : item) } }, routing);
  }

  const mainTools = (
    <div className="circuit-toolbar circuit-main-tools" role="group" aria-label={copy.tools}>
      <button type="button" aria-pressed={tool === null} onClick={() => chooseTool(null)}>{copy.select}</button>
      {(!embedded || !drawing.extension && !!drawing.topology.components.length) && (Object.keys(parts) as PartKind[]).map(kind => <button type="button" key={kind}
        aria-pressed={tool === kind} onClick={() => chooseTool(kind)}>
        {copy.kinds[kind]}
      </button>)}
      <button type="button" aria-pressed={tool === "wire"} onClick={() => chooseTool("wire")}>{copy.wire}</button>
      <button type="button" aria-pressed={tool === "junction"} onClick={() => chooseTool("junction")}>{copy.junction}</button>
      <button type="button" onClick={() => {
        const demo = demoDrawing();
        if (commit(demo, routeDrawing(demo))) chooseTool(null);
      }}>{copy.demo}</button>
      <button type="button" onClick={() => {
        const demo = lineDemoDrawing();
        if (commit(demo, routeDrawing(demo))) chooseTool(null);
      }}>{copy.lineDemo}</button>
      <button type="button" disabled={optimizing || !drawing.topology.wires.length}
        onClick={() => optimize(false)}>{copy.optimize}</button>
      <button type="button" disabled={optimizing || !drawing.topology.wires.length}
        onClick={() => optimize(true)}>{copy.arrange}</button>
      {optimizing && <button type="button" onClick={stopOptimization}>
        {language === "ru" ? "Отменить оптимизацию" : "Скасувати оптимізацію"}
      </button>}
      <button type="button" aria-label={embedded ? language === "ru" ? "Отменить изменение" : "Скасувати зміну" : undefined} disabled={!(history?.canUndo ?? undo.current.length)} onClick={() => travel(true)}>{copy.undo}</button>
      <button type="button" aria-label={embedded ? language === "ru" ? "Повторить изменение" : "Повторити зміну" : undefined} disabled={!(history?.canRedo ?? redo.current.length)} onClick={() => travel(false)}>{copy.redo}</button>
      <button type="button" disabled={!drawing.topology.components.length && !drawing.topology.junctions.length}
        onClick={() => {
          if (onClear) { confirmClear.current?.showModal(); return; }
          if (!window.confirm(copy.confirm)) return;
          if (commit(emptyDrawing())) chooseTool(null); }}>{embedded ? language === "ru" ? "Очистить схему" : "Очистити схему" : copy.clear}</button>
      {onClear && <dialog ref={confirmClear} className="network-clear-dialog">
        <p>{language === "ru" ? "Очистить всю схему? Все размещённые элементы и соединения будут удалены."
          : "Очистити всю схему? Усі розміщені елементи та з’єднання буде видалено."}</p>
        <button type="button" onClick={() => confirmClear.current?.close()}>{language === "ru" ? "Отмена" : "Скасувати"}</button>
        <button type="button" onClick={() => { confirmClear.current?.close(); onClear(); }}>{language === "ru" ? "Очистить" : "Очистити"}</button>
      </dialog>}
    </div>
  );

  return <section className="circuit-editor" data-circuit-editor data-embedded={embedded || undefined} data-ready={ready} onKeyDown={event => {
    if (event.key === "Escape") { chooseTool(null); extension?.onCancel?.(); }
    if ((event.ctrlKey || event.metaKey) && !(event.target as Element).closest("input, textarea, [contenteditable]")) {
      const focusedPart = (event.target as Element).closest("[data-component-id]")?.getAttribute("data-component-id");
      if (event.key.toLowerCase() === "c") clipboard.current = focusedPart ?? selected;
      if (event.key.toLowerCase() === "v" && clipboard.current) {
        const origin = drawing.positions[clipboard.current];
        if (origin && extension?.onCopy?.(clipboard.current, drawing, snap({ x: origin.x, y: origin.y + 80 }))) event.preventDefault();
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" &&
        !(event.target as Element).closest("input, textarea, [contenteditable]")) {
      event.preventDefault();
      travel(!event.shiftKey);
    }
  }}>
    {embedded ? <h3>{language === "ru" ? "Универсальный редактор схем" : "Універсальний редактор схем"}</h3> : <h1>{copy.title}</h1>}
    {extension?.controls?.(drawing)}
    {!embedded && mainTools}
    <div ref={viewportRef} className="circuit-viewport" data-circuit-nets={JSON.stringify(nets)}>
      <svg data-circuit-board data-network-canvas={embedded || undefined} data-zoom={zoom} data-placing={tool !== null || extension?.placing || undefined} aria-label={copy.board}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`} preserveAspectRatio="xMinYMin meet" style={{ width: `${zoom * 100}%` }}
        onPointerDown={extension?.onStroke?.start ?? start} onPointerMove={extension?.onStroke?.move ?? drag}
        onPointerLeave={event => extension?.onHover?.(event, null)}
        onPointerUp={extension?.onStroke?.finish ?? finish} onPointerCancel={extension?.onStroke?.cancel ?? cancel}
        onLostPointerCapture={extension?.onStroke?.cancel ?? cancel}>
        <defs><pattern id="circuit-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" fill="#a6b4c4" />
        </pattern></defs>
        <g ref={drawingLayer} className={embedded ? "network-schematic-drawing" : undefined}>
          {lineStart && <circle cx={lineStart.x} cy={lineStart.y} r="5" fill="#117bb1" />}
          {showGrid && <rect width={boardWidth} height={boardHeight} fill="url(#circuit-grid)" />}
          {drawing.topology.wires.map(({ id, from, to }) => {
            const points = previewRoutes?.paths[id] ?? routing.paths[id];
            return points && <polyline key={id} data-circuit-wire={id}
              data-wire-endpoint={[from, to].find(value => value.includes(":"))} data-wire-selected={selectionWire === id}
              {...extension?.describeWire?.(id, drawing)} points={points.map(p => p.x + "," + p.y).join(" ")} />;
          })}
          <ZigzagResistors.Provider value={zigzag}>
            {drawing.topology.components.map(item => {
              const { rotation, span, ...stored } = drawing.positions[item.id];
              const reading = calculated?.topology === drawing.topology && calculated.document === activeDocument ? readings?.get(item.id) : undefined;
              const { x, y } = preview?.id === item.id ? preview : stored;
              const closed = extension?.partClosed?.(item.id, drawing) ?? (item.kind === "switch" ? item.parameters.closed === true : undefined);
              return <g key={item.id} data-component-id={item.id} data-rotation={rotation} data-closed={closed}
                data-line-section={item.kind === "line" ? item.id : undefined}
                role="button" tabIndex={0} aria-label={item.kind === "line" ? item.id + (language === "ru" ? " · линия" : " · лінія") : item.id}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item.id); }
                }}
                {...extension?.describePart?.(item.id, drawing)}
                transform={`translate(${x} ${y})`} className={selected === item.id ? "circuit-selected" : undefined}>
                <rect x="-36" y="-29" width="72" height="58" rx="8" className="circuit-component-hit" />
                <g transform={`rotate(${rotation})`} data-line-angle={item.kind === "line" ? rotation : undefined}><Glyph kind={item.kind as PartKind} span={span} ground={extension?.groundPart?.(item.id)} closed={closed} reversed={item.parameters.reversed === true} /></g>
                <text x="0" y="-25" textAnchor="middle">{item.id}</text>
                {reading && <text data-circuit-reading={item.id} x="0" y="31" textAnchor="middle">
                  {reading.current ? `${reading.voltage} · ${reading.current}` : reading.voltage}
                </text>}
              </g>;
            })}
          </ZigzagResistors.Provider>
          {extension?.overlay?.(drawing)}
          {[...ports].filter(([, port]) => tool === "wire" || !port.owner && !extension?.boardTool).map(([id, { pin, owner }]) =>
            <g key={id} data-circuit-terminal={id} className="circuit-pin">
              <circle cx={pin.x} cy={pin.y} r="12" fill="transparent" />
              <circle cx={pin.x} cy={pin.y} r={owner ? 4 : 5} fill={id === wireStart ? "#117bb1" : owner ? "#fff" : "#172d42"}
                stroke="#172d42" strokeWidth="1.5" />
            </g>)}
        </g>
      </svg>
    </div>
    {embedded && mainTools}
    {extension?.inspector?.(drawing, selected)}
    <div className="circuit-toolbar circuit-file-tools">
      {!embedded && <button type="button" onClick={saveLocal}>{copy.save}</button>}
      {onCalculate && <button type="button" onClick={() => {
        try {
          const document = serialized();
          onCalculate(document);
          setCalculated({ topology: drawing.topology, document });
        } catch {
          setConflict("fileError");
        }
      }}>{copy.calculate}</button>}
      <button type="button" onClick={exportFile}>{copy.exportFile}</button>
      <button type="button" onClick={() => fileInput.current?.click()}>{copy.importFile}</button>
      <input hidden ref={fileInput} aria-label={copy.importFile} type="file" accept="application/json,.json"
        onChange={event => {
          const file = event.currentTarget.files?.item(0);
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }} />
    </div>
    <div className="circuit-toolbar circuit-view-controls">
      {embedded && <button type="button" onClick={() => {setZoom(1);viewportRef.current?.scrollTo(0,0);}}>
        {language === "ru" ? "Показать всю схему" : "Показати всю схему"}
      </button>}
      <button type="button" aria-label={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(zoom / 1.25)}>−</button>
      <button type="button" aria-label={copy.zoomIn} disabled={zoom >= 1.95} onClick={() => setZoom(zoom * 1.25)}>+</button>
      <label>{copy.grid} <select value={grid} onChange={event => updateSettings("grid", Number(event.target.value))}>
        <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
      </select></label>
      <label><input type="checkbox" checked={alignToGrid} onChange={event => updateSettings("snap", event.target.checked)} /> {copy.snap}</label>
      <label><input type="checkbox" checked={showGrid} onChange={event => updateSettings("showGrid", event.target.checked)} /> {copy.showGrid}</label>
      {embedded ? <label>{language === "ru" ? "УГО резисторов" : "УГП резисторів"} <select value={zigzag ? "ansi" : "iec"}
        onChange={event => updateSettings("zigzag", event.target.value === "ansi")}>
        <option value="iec">IEC</option><option value="ansi">ANSI</option>
      </select></label> : <label><input type="checkbox" checked={zigzag} onChange={event => updateSettings("zigzag", event.target.checked)} /> {copy.zigzag}</label>}
    </div>
    <div className="circuit-toolbar circuit-selection">
      <label>{copy.select} <select aria-label={copy.select} value={selected ?? ""} onChange={event => { setSelectionWire(null); select(event.target.value || null); }}>
        <option value="">—</option>
        {drawing.topology.components.map(item => <option value={item.id} key={item.id}>{item.id}</option>)}
      </select></label>
      {parameters.map(([name, value]) => typeof value === "boolean" ? <label key={selected + name}>
        <input type="checkbox" checked={value} onChange={event => saveParameter(name, value, event.target.checked)} /> {name === "closes" ? copy.closes : name === "reversed" ? copy.reversed : copy.closed}
      </label> : <form key={selected + name} onSubmit={event => {
        event.preventDefault();
        const field = new FormData(event.currentTarget).get("nominal");
        if (typeof field === "string") saveParameter(name, value, field);
      }}>
        <label>{(parameters.length === 1 || name === "ohm") ? copy.parameter : copy.parameterLabels[name as keyof typeof copy.parameterLabels]}
          <input key={String(value)} name="nominal" type="number" step="any"
            defaultValue={String(value)} onBlur={event => saveParameter(name, value, event.target.value)} />
        </label>
      </form>)}
      {selectionWire && <button type="button" onClick={() => {
        if (commit({ ...drawing, topology: disconnect(drawing.topology, selectionWire) })) setSelectionWire(null);
      }}>{copy.remove} {selectionWire}</button>}
      {selected && <><button type="button" disabled={drawing.positions[selected].pinned} onClick={rotate}>{copy.rotate}</button>
        <button type="button" aria-pressed={!!drawing.positions[selected].pinned} onClick={() => {
          const p = drawing.positions[selected];
          commit({ ...drawing, positions: { ...drawing.positions, [selected]: { ...p, pinned: !p.pinned } } }, routing);
        }}>{copy.pin}</button>
        <button type="button" onClick={remove}>{copy.remove}</button></>}
    </div>
    {tool === "wire" && <select aria-label={wireStart ? copy.selectEnd : copy.selectStart} value=""
      onChange={event => { if (event.target.value) choose(event.target.value); }}>
      <option value="">{wireStart ? copy.selectEnd : copy.selectStart}</option>
      {[...ports.keys()].map(id => <option key={id} value={id}>{id}</option>)}
    </select>}
    <p className="circuit-message" role="status">{conflict ? copy[conflict] : tool === "wire" ?
      wireStart ? copy.selectEnd : copy.selectStart : tool === "line" ?
      lineStart ? copy.selectEnd : copy.selectStart : drawing.topology.components.length ? "" : copy.blank}</p>
  </section>;
}
