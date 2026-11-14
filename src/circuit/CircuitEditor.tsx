import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import type { Language } from "../types";
import { circuitCopy } from "./copy";
import { canPlace, demoDrawing, emptyDrawing, junctionAt, parts, placeComponent, wireDrawing, type PartKind, type Point } from "./drawing";
import { drawingPorts, routeDrawing } from "./routing";
import { netlist, removeComponent } from "./topology";
import "./circuit-editor.css";

const boardWidth = 540;
const boardHeight = 360;
type Gesture = { pointer: number; component: string | null; terminal: string | null; start: Point; origin: Point };

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
  const [drawing, setDrawing] = useState(emptyDrawing);
  const [tool, setTool] = useState<PartKind | "wire" | "junction" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(10);
  const [showGrid, setShowGrid] = useState(false);
  const [zigzag, setZigzag] = useState(false);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState<"collision" | "routeError" | null>(null);
  const [wireStart, setWireStart] = useState<string | null>(null);
  const routing = useMemo(() => routeDrawing(drawing), [drawing]);
  const ports = useMemo(() => drawingPorts(drawing), [drawing]);
  const nets = useMemo(() => netlist(drawing.topology), [drawing.topology]);
  function commit(next: typeof drawing) {
    const planned = routeDrawing(next);
    if (planned.unrouted.length) {
      setConflict("routeError");
      return false;
    }
    setDrawing(next);
    setConflict(null);
    return true;
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
    const target = element.closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
    gesture.current = {
      pointer: event.pointerId, component: target, terminal, start: at, origin: target ? drawing.positions[target] : at,
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
      if (!canPlace(drawing, destination)) return setConflict("collision");
      const next = placeComponent(drawing, tool, destination);
      if (!commit(next)) return;
      setSelected(next.topology.components.at(-1)!.id);
      setTool(null);
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
      <button type="button" onClick={() => { if (commit(demoDrawing())) chooseTool(null); }}>{copy.demo}</button>
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
