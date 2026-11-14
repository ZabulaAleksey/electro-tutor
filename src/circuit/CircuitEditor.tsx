import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import type { Language } from "../types";
import { circuitCopy } from "./copy";
import { canPlace, demoDrawing, emptyDrawing, insertInWire, junctionAt, parts, placeComponent, wireDrawing, type Drawing, type PartKind, type Point } from "./drawing";
import { drawingPorts, optimizeDrawing, routeDrawing, type Routing } from "./routing";
import { netlist, removeComponent } from "./topology";
import "./circuit-editor.css";

const boardWidth = 540;
const boardHeight = 360;
type Gesture = { pointer: number; component: string | null; terminal: string | null; wire: string | null; start: Point; origin: Point };

function Glyph({ kind }: { kind: PartKind }) {
  switch (kind) {
    case "r": return <ResistorGlyph x={-29} y={0} />;
    case "l": return <InductorGlyph x={-27} y={0} />;
    case "c": return <CapacitorGlyph x={0} y={0} terminalSpan={54} orientation="horizontal" />;
    case "diode": return <DiodeGlyph x={-11.5} y={0} />;
    case "voltage": return <g transform="rotate(-90)"><SourceGlyph x={0} y={0} /></g>;
  }
}

export default function CircuitEditor({ language }: { language: Language }) {
  const copy = circuitCopy(language);
  const [snapshot, setSnapshot] = useState(() => ({ drawing: emptyDrawing(), routing: routeDrawing(emptyDrawing()) }));
  const { drawing, routing } = snapshot;
  const undo = useRef<typeof snapshot[]>([]);
  const redo = useRef<typeof snapshot[]>([]);
  const [tool, setTool] = useState<PartKind | "wire" | "junction" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(10);
  const [showGrid, setShowGrid] = useState(false);
  const [zigzag, setZigzag] = useState(false);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState<"collision" | "routeError" | null>(null);
  const [wireStart, setWireStart] = useState<string | null>(null);
  const ports = useMemo(() => drawingPorts(drawing), [drawing]);
  const nets = useMemo(() => netlist(drawing.topology), [drawing.topology]);
  function commit(next: Drawing, planned: Routing = routeDrawing(next, next.topology.wires, routing)) {
    if (planned.unrouted.length) {
      setConflict("routeError");
      return false;
    }
    if (next === drawing && planned === routing) return true;
    undo.current = [...undo.current.slice(-79), snapshot];
    redo.current = [];
    setSnapshot({ drawing: next, routing: planned });
    setConflict(null);
    return true;
  }
  function travel(back: boolean) {
    const source = back ? undo.current : redo.current;
    const target = back ? redo.current : undo.current;
    const previous = source.pop();
    if (!previous) return;
    target.push(snapshot);
    chooseTool(null);
    setSnapshot(previous);
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
  function chooseTool(next: typeof tool) {
    setTool(next);
    setSelected(null);
    setWireStart(null);
    setConflict(null);
  }
  const [preview, setPreview] = useState<Point | null>(null);
  const drawingLayer = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => setReady(true), []);

  function point(event: PointerEvent<SVGSVGElement>) {
    const matrix = drawingLayer.current?.getScreenCTM();
    if (!matrix) return null;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x, y };
  }

  function snap(at: Point) {
    const snapAxis = (value: number, max: number) => grid * Math.max(
      Math.ceil(40 / grid), Math.min(Math.floor((max - 40) / grid), Math.round(value / grid)),
    );
    return { x: snapAxis(at.x, boardWidth), y: snapAxis(at.y, boardHeight) };
  }

  function start(event: PointerEvent<SVGSVGElement>) {
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
    if (target) setSelected(target);
  }

  function drag(event: PointerEvent<SVGSVGElement>) {
    const held = gesture.current;
    const at = point(event);
    if (tool === "wire" || !held?.component || held.pointer !== event.pointerId || !at) return;
    if (Math.hypot(at.x - held.start.x, at.y - held.start.y) < 4) {
      setPreview(null);
      return;
    }
    const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
    setPreview(destination);
    setConflict(canPlace(drawing, destination, held.component) ? null : "collision");
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    const held = gesture.current;
    const at = point(event);
    if (!held || held.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (!at) return;
    const moved = Math.hypot(at.x - held.start.x, at.y - held.start.y) >= 4;
    if (tool === "wire") {
      if (!moved && held.terminal) choose(held.terminal);
      return;
    }
    if (held.component && moved) {
      const id = held.component;
      const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
      if (!canPlace(drawing, destination, id)) return setConflict("collision");
      commit({ ...drawing, positions: { ...drawing.positions, [id]: { ...drawing.positions[id], ...destination } } });
    }
    if (!held.component && !moved) {
      setSelected(null);
      if (!tool) return;
      const destination = snap(at);
      if (tool === "junction") {
        const blocked = Object.values(drawing.positions).some(p => Math.abs(p.x - destination.x) < 40 && Math.abs(p.y - destination.y) < 40);
        const coincides = [...ports.values()].some(({ pin }) => pin.x === destination.x && pin.y === destination.y);
        if (blocked || coincides) return setConflict("collision");
        if (commit(junctionAt(drawing, destination))) setTool(null);
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

  function cancel(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    setConflict(null);
  }

  function rotate() {
    if (!selected) return;
    const current = drawing.positions[selected];
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
  const parameter = selectedItem && Object.entries(selectedItem.parameters)[0];
  function saveParameter(raw: string) {
    if (!selectedItem || !parameter || !raw.trim()) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || (selectedItem.kind !== "voltage" && value <= 0)) return;
    const [name, previous] = parameter;
    if (previous === value) return;
    commit({ ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(item =>
      item === selectedItem ? { ...item, parameters: { ...item.parameters, [name]: value } } : item) } }, routing);
  }

  return <section className="circuit-editor" data-circuit-editor data-ready={ready}>
    <h1>{copy.title}</h1>
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
      <button type="button" disabled={!drawing.topology.wires.length}
        onClick={() => commit(drawing, optimizeDrawing(drawing, routing))}>{copy.optimize}</button>
      <button type="button" disabled={!undo.current.length} onClick={() => travel(true)}>{copy.undo}</button>
      <button type="button" disabled={!redo.current.length} onClick={() => travel(false)}>{copy.redo}</button>
      <button type="button" disabled={!drawing.topology.components.length && !drawing.topology.junctions.length}
        onClick={() => { if (window.confirm(copy.confirm) && commit(emptyDrawing())) chooseTool(null); }}>{copy.clear}</button>
    </div>
    <div className="circuit-toolbar">
      <button type="button" aria-label={copy.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(zoom / 1.25)}>−</button>
      <button type="button" aria-label={copy.zoomIn} disabled={zoom >= 1.95} onClick={() => setZoom(zoom * 1.25)}>+</button>
      <label>{copy.grid} <select value={grid} onChange={event => setGrid(Number(event.target.value))}>
        <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
      </select></label>
      <label><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> {copy.showGrid}</label>
      <label><input type="checkbox" checked={zigzag} onChange={event => setZigzag(event.target.checked)} /> {copy.zigzag}</label>
    </div>
    <div className="circuit-viewport" data-circuit-nets={JSON.stringify(nets)}>
      <svg data-circuit-board data-zoom={zoom} aria-label={copy.board}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ width: `${zoom * 100}%` }}
        onPointerDown={start} onPointerMove={drag} onPointerUp={finish} onPointerCancel={cancel}
        onLostPointerCapture={cancel}>
        <defs><pattern id="circuit-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" fill="#a6b4c4" />
        </pattern></defs>
        <g ref={drawingLayer}>
          {showGrid && <rect width={boardWidth} height={boardHeight} fill="url(#circuit-grid)" />}
          {Object.entries(routing.paths).map(([id, points]) =>
            <polyline key={id} data-circuit-wire={id} points={points.map(p => p.x + "," + p.y).join(" ")} />)}
          <ZigzagResistors.Provider value={zigzag}>
            {drawing.topology.components.map(item => {
              const { rotation, ...stored } = drawing.positions[item.id];
              const { x, y } = selected === item.id && preview ? preview : stored;
              return <g key={item.id} data-component-id={item.id} data-rotation={rotation}
                transform={`translate(${x} ${y})`} className={selected === item.id ? "circuit-selected" : undefined}>
                <rect x="-36" y="-29" width="72" height="58" rx="8" className="circuit-component-hit" />
                <g transform={`rotate(${rotation})`}><Glyph kind={item.kind as PartKind} /></g>
                <text x="0" y="25" textAnchor="middle">{item.id}</text>
              </g>;
            })}
          </ZigzagResistors.Provider>
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
      <label>{copy.select} <select aria-label={copy.select} value={selected ?? ""} onChange={event => setSelected(event.target.value || null)}>
        <option value="">—</option>
        {drawing.topology.components.map(item => <option value={item.id} key={item.id}>{item.id}</option>)}
      </select></label>
      {parameter && <form onSubmit={event => {
        event.preventDefault();
        const field = new FormData(event.currentTarget).get("nominal");
        if (typeof field === "string") saveParameter(field);
      }}>
        <label>{copy.parameter} <input key={selected + String(parameter[1])} name="nominal" type="number" step="any"
          defaultValue={String(parameter[1])} onBlur={event => saveParameter(event.target.value)} /></label>
      </form>}
      {selected && <><button type="button" onClick={rotate}>{copy.rotate}</button>
        <button type="button" onClick={remove}>{copy.remove}</button></>}
    </div>
    {tool === "wire" && <select aria-label={wireStart ? copy.selectEnd : copy.selectStart} value=""
      onChange={event => { if (event.target.value) choose(event.target.value); }}>
      <option value="">{wireStart ? copy.selectEnd : copy.selectStart}</option>
      {[...ports.keys()].map(id => <option key={id} value={id}>{id}</option>)}
    </select>}
    <p className="circuit-message" role="status">{conflict ? copy[conflict] : tool === "wire" ?
      wireStart ? copy.selectEnd : copy.selectStart : drawing.topology.components.length ? "" : copy.blank}</p>
  </section>;
}
