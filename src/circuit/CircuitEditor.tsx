import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import type { Language } from "../types";
import { circuitCopy } from "./copy";
import { defaultCircuitSettings, maxCircuitFileBytes, parseCircuit, serializeCircuit, type CircuitSettings } from "./document";
import { canPlace, defaultBoard, demoDrawing, emptyDrawing, insertInWire, junctionAt, lineDemoDrawing, parts, placeComponent, placeLine, splitWireAt, validPartParameter, wireDrawing, type Drawing, type PartKind, type Point } from "./drawing";
import { clearGeometry, drawingPorts, optimizeDrawing, optimizeLayout, routeDrawing, type Routing } from "./routing";
import { disconnect, netlist, removeComponent, type Parameter } from "./topology";
import "./circuit-editor.css";

const storageKey = "electrotutor.circuit.v1";
type Snapshot = { drawing: Drawing; routing: Routing; settings: CircuitSettings; title: string };
type Gesture = { pointer: number; component: string | null; terminal: string | null; wire: string | null; start: Point; origin: Point };

function Glyph({ kind, span = 58, closed, reversed }: { kind: PartKind; span?: number; closed?: boolean; reversed?: boolean }) {
  switch (kind) {
    case "line": return <g stroke="var(--ink)" fill="var(--white)" strokeWidth="1.7"><path d={`M${-span / 2} 0H${span / 2}`} /><rect x={-span / 2 + 8} y="-9" width={span - 16} height="18" rx="9" /><path d="M-12 0H12M7 -4L12 0L7 4" fill="none" /></g>;
    case "r": return <ResistorGlyph x={-29} y={0} />;
    case "l": return <InductorGlyph x={-27} y={0} />;
    case "c": return <CapacitorGlyph x={0} y={0} terminalSpan={54} orientation="horizontal" />;
    case "diode": return <g transform={reversed ? "scale(-1 1)" : undefined}><DiodeGlyph x={-11.5} y={0} /></g>;
    case "voltage":
    case "current": return <g transform="rotate(-90)"><SourceGlyph x={0} y={0} current={kind === "current"} /></g>;
    case "open": return <path d="M-24 0H-8M8 0H24" stroke="var(--ink)" strokeWidth="1.7" />;
    case "bridge": return <path d="M-24 0H24" stroke="var(--ink)" strokeWidth="1.7" />;
    case "switch": return <path d={closed ? "M-24 0H24" : "M-24 0H-10L10 -10M10 0H24"}
      stroke="var(--ink)" strokeWidth="1.7" fill="none" />;
  }
}

export type CircuitReading = { voltage: string; current?: string };

export type CircuitBoardExtension = {
  controls?: (drawing: Drawing, selected: string | null) => ReactNode;
  overlay?: (drawing: Drawing) => ReactNode;
  onTap?: (point: Point, drawing: Drawing) => boolean;
  onSelect?: (id: string | null, drawing: Drawing) => void;
  onStroke?: {
    start: (event: PointerEvent<SVGSVGElement>) => void;
    move: (event: PointerEvent<SVGSVGElement>) => void;
    finish: (event: PointerEvent<SVGSVGElement>) => void;
    cancel: (event: PointerEvent<SVGSVGElement>) => void;
  };
};

export default function CircuitEditor({ language, embedded = false, initial, activeDocument, onCalculate, readings,
  extension, onDocumentChange, onClear }: {
  language: Language;
  embedded?: boolean;
  initial?: string;
  activeDocument?: string;
  onCalculate?: (document: string) => void;
  readings?: ReadonlyMap<string, CircuitReading>;
  extension?: CircuitBoardExtension;
  onDocumentChange?: (document: string) => void;
  onClear?: () => void;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [selectionWire, setSelectionWire] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(embedded);
  const [calculated, setCalculated] = useState(() => initial ? { topology: snapshot.drawing.topology, document: initial } : null);
  const [conflict, setConflict] = useState<"collision" | "routeError" | "fileError" | "saved" | null>(null);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [wireStart, setWireStart] = useState<string | null>(null);
  const ports = useMemo(() => drawingPorts(drawing), [drawing]);
  const [preview, setPreview] = useState<Point | null>(null);
  const previewDrawing = useMemo(() => preview && selected ? { ...drawing, positions: { ...drawing.positions,
    [selected]: { ...drawing.positions[selected], ...preview },
  } } : null, [drawing, preview, selected]);
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
    record({ ...snapshot, drawing: next, routing: planned });
    return true;
  }
  function record(next: Snapshot) {
    importSequence.current++;
    undo.current = [...undo.current.slice(-79), snapshot];
    redo.current = [];
    setSnapshot(next);
    onDocumentChange?.(serializeCircuit(next.drawing, next.settings, next.title));
    setConflict(null);
  }
  function updateSettings<Setting extends keyof CircuitSettings>(key: Setting, value: CircuitSettings[Setting]) {
    if (settings[key] !== value) record({ ...snapshot, settings: { ...settings, [key]: value } });
  }
  function travel(back: boolean) {
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
    const element = event.target as Element;
    const terminal = element.closest("[data-circuit-terminal]")?.getAttribute("data-circuit-terminal") ?? null;
    const wire = element.closest("[data-circuit-wire]")?.getAttribute("data-circuit-wire") ?? null;
    const target = element.closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
    gesture.current = {
      pointer: event.pointerId, component: target, terminal, wire, start: at, origin: target ? drawing.positions[target] : at,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setConflict(null);
    if (target) { select(target); setSelectionWire(null); }
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
    if (tool === "wire" || !held?.component || drawing.positions[held.component].pinned || held.pointer !== event.pointerId || !at) return;
    if (Math.hypot(at.x - held.start.x, at.y - held.start.y) < 4) {
      setPreview(null);
      return;
    }
    const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
    setPreview(point => point?.x === destination.x && point.y === destination.y ? point : destination);
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

  return <section className="circuit-editor" data-circuit-editor data-ready={ready} onKeyDown={event => {
    if (event.key === "Escape") chooseTool(null);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" &&
        !(event.target as Element).closest("input, textarea, [contenteditable]")) {
      event.preventDefault();
      travel(!event.shiftKey);
    }
  }}>
    {embedded ? <h3>{copy.title}</h3> : <h1>{copy.title}</h1>}
    <div className="circuit-toolbar" role="group" aria-label={copy.tools}>
      <button type="button" aria-pressed={tool === null} onClick={() => chooseTool(null)}>{copy.select}</button>
      {(Object.keys(parts) as PartKind[]).map(kind => <button type="button" key={kind}
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
      <button type="button" disabled={!drawing.topology.wires.length}
        onClick={() => commit(drawing, optimizeDrawing(drawing, routing))}>{copy.optimize}</button>
      <button type="button" disabled={!drawing.topology.wires.length} onClick={() => {
        const plan = optimizeLayout(drawing, routing, grid);
        commit(plan.drawing, plan.routing);
      }}>{copy.arrange}</button>
      <button type="button" disabled={!undo.current.length} onClick={() => travel(true)}>{copy.undo}</button>
      <button type="button" disabled={!redo.current.length} onClick={() => travel(false)}>{copy.redo}</button>
      <button type="button" disabled={!drawing.topology.components.length && !drawing.topology.junctions.length}
        onClick={() => { if (!window.confirm(copy.confirm)) return;
          if (commit(emptyDrawing())) { chooseTool(null); onClear?.(); } }}>{copy.clear}</button>
    </div>
    <div className="circuit-toolbar">
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
    <div className="circuit-toolbar">
      <button type="button" aria-label={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(zoom / 1.25)}>−</button>
      <button type="button" aria-label={copy.zoomIn} disabled={zoom >= 1.95} onClick={() => setZoom(zoom * 1.25)}>+</button>
      <label>{copy.grid} <select value={grid} onChange={event => updateSettings("grid", Number(event.target.value))}>
        <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
      </select></label>
      <label><input type="checkbox" checked={alignToGrid} onChange={event => updateSettings("snap", event.target.checked)} /> {copy.snap}</label>
      <label><input type="checkbox" checked={showGrid} onChange={event => updateSettings("showGrid", event.target.checked)} /> {copy.showGrid}</label>
      <label><input type="checkbox" checked={zigzag} onChange={event => updateSettings("zigzag", event.target.checked)} /> {copy.zigzag}</label>
    </div>
    {extension?.controls?.(drawing, selected)}
    <div className="circuit-viewport" data-network-canvas={embedded || undefined} data-circuit-nets={JSON.stringify(nets)}>
      <svg data-circuit-board data-zoom={zoom} aria-label={copy.board}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ width: `${zoom * 100}%` }}
        onPointerDown={extension?.onStroke?.start ?? start} onPointerMove={extension?.onStroke?.move ?? drag}
        onPointerUp={extension?.onStroke?.finish ?? finish} onPointerCancel={extension?.onStroke?.cancel ?? cancel}
        onLostPointerCapture={extension?.onStroke?.cancel ?? cancel}>
        <defs><pattern id="circuit-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" fill="#a6b4c4" />
        </pattern></defs>
        <g ref={drawingLayer} className={embedded ? "network-schematic-drawing" : undefined}>
          {lineStart && <circle cx={lineStart.x} cy={lineStart.y} r="5" fill="#117bb1" />}
          {showGrid && <rect width={boardWidth} height={boardHeight} fill="url(#circuit-grid)" />}
          {Object.entries(previewRoutes?.paths ?? routing.paths).map(([id, points]) =>
            <polyline key={id} data-circuit-wire={id} data-wire-selected={selectionWire === id} points={points.map(p => p.x + "," + p.y).join(" ")} />)}
          <ZigzagResistors.Provider value={zigzag}>
            {drawing.topology.components.map(item => {
              const { rotation, span, ...stored } = drawing.positions[item.id];
              const reading = calculated?.topology === drawing.topology && calculated.document === activeDocument ? readings?.get(item.id) : undefined;
              const { x, y } = selected === item.id && preview ? preview : stored;
              return <g key={item.id} data-component-id={item.id} data-rotation={rotation}
                data-line-section={item.kind === "line" ? item.id : undefined}
                role="button" tabIndex={0} aria-label={item.kind === "line" ? item.id + (language === "ru" ? " · линия" : " · лінія") : item.id}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item.id); }
                }}
                transform={`translate(${x} ${y})`} className={selected === item.id ? "circuit-selected" : undefined}>
                <rect x="-36" y="-29" width="72" height="58" rx="8" className="circuit-component-hit" />
                <g transform={`rotate(${rotation})`}><Glyph kind={item.kind as PartKind} span={span} closed={item.parameters.closed === true} reversed={item.parameters.reversed === true} /></g>
                <text x="0" y="-25" textAnchor="middle">{item.id}</text>
                {reading && <text data-circuit-reading={item.id} x="0" y="31" textAnchor="middle">
                  {reading.current ? `${reading.voltage} · ${reading.current}` : reading.voltage}
                </text>}
              </g>;
            })}
          </ZigzagResistors.Provider>
          {extension?.overlay?.(drawing)}
          {[...ports].filter(([, port]) => !port.owner || tool === "wire").map(([id, { pin, owner }]) =>
            <g key={id} data-circuit-terminal={id} className="circuit-pin">
              <circle cx={pin.x} cy={pin.y} r="12" fill="transparent" />
              <circle cx={pin.x} cy={pin.y} r={owner ? 4 : 5} fill={id === wireStart ? "#117bb1" : owner ? "#fff" : "#172d42"}
                stroke="#172d42" strokeWidth="1.5" />
            </g>)}
        </g>
      </svg>
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
