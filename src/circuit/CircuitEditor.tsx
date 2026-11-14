import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import type { Language } from "../types";
import { circuitCopy } from "./copy";
import { canPlace, demoDrawing, emptyDrawing, parts, placeComponent, type PartKind, type Point } from "./drawing";
import { removeComponent } from "./topology";
import "./circuit-editor.css";

const boardWidth = 540;
const boardHeight = 360;
type Gesture = { pointer: number; component: string | null; start: Point; origin: Point };

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
  const [tool, setTool] = useState<PartKind | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(10);
  const [showGrid, setShowGrid] = useState(false);
  const [zigzag, setZigzag] = useState(false);
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState(false);
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
    const target = (event.target as Element).closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
    gesture.current = {
      pointer: event.pointerId, component: target, start: at, origin: target ? drawing.positions[target] : at,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setConflict(false);
    if (target) setSelected(target);
  }

  function drag(event: PointerEvent<SVGSVGElement>) {
    const held = gesture.current;
    const at = point(event);
    if (!held?.component || held.pointer !== event.pointerId || !at) return;
    if (Math.hypot(at.x - held.start.x, at.y - held.start.y) < 4) {
      setPreview(null);
      return;
    }
    const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
    setPreview(destination);
    setConflict(!canPlace(drawing, destination, held.component));
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    const held = gesture.current;
    const at = point(event);
    if (!held || held.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (!at) return;
    const moved = Math.hypot(at.x - held.start.x, at.y - held.start.y) >= 4;
    if (held.component && moved) {
      const id = held.component;
      const destination = snap({ x: held.origin.x + at.x - held.start.x, y: held.origin.y + at.y - held.start.y });
      if (!canPlace(drawing, destination, id)) return setConflict(true);
      setDrawing({ ...drawing, positions: { ...drawing.positions, [id]: { ...drawing.positions[id], ...destination } } });
    }
    if (!held.component && !moved) {
      setSelected(null);
      if (!tool) return;
      const destination = snap(at);
      if (!canPlace(drawing, destination)) return setConflict(true);
      const next = placeComponent(drawing, tool, destination);
      setDrawing(next);
      setSelected(next.topology.components.at(-1)!.id);
      setTool(null);
    }
  }

  function cancel(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    setConflict(false);
  }

  function rotate() {
    if (!selected) return;
    const current = drawing.positions[selected];
    setDrawing({ ...drawing, positions: {
      ...drawing.positions, [selected]: { ...current, rotation: (current.rotation + 90) % 360 },
    } });
  }

  function remove() {
    if (!selected) return;
    const positions = { ...drawing.positions };
    delete positions[selected];
    setDrawing({ topology: removeComponent(drawing.topology, selected), positions });
    setSelected(null);
  }

  return <section className="circuit-editor" data-circuit-editor data-ready={ready}>
    <h1>{copy.title}</h1>
    <div className="circuit-toolbar" role="group" aria-label={copy.tools}>
      <button type="button" aria-pressed={tool === null} onClick={() => setTool(null)}>{copy.select}</button>
      {(Object.keys(parts) as PartKind[]).map(kind => <button type="button" key={kind}
        aria-pressed={tool === kind} onClick={() => { setTool(kind); setSelected(null); setConflict(false); }}>
        {copy.kinds[kind]}
      </button>)}
      <button type="button" onClick={() => { setDrawing(demoDrawing()); setTool(null); setSelected(null); setConflict(false); }}>{copy.demo}</button>
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
    <div className="circuit-viewport">
      <svg data-circuit-board data-zoom={zoom} aria-label={copy.board}
        viewBox={`0 0 ${boardWidth} ${boardHeight}`} style={{ width: `${zoom * 100}%` }}
        onPointerDown={start} onPointerMove={drag} onPointerUp={finish} onPointerCancel={cancel}
        onLostPointerCapture={cancel}>
        <defs><pattern id="circuit-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" fill="#a6b4c4" />
        </pattern></defs>
        <g ref={drawingLayer}>
          {showGrid && <rect width={boardWidth} height={boardHeight} fill="url(#circuit-grid)" />}
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
        </g>
      </svg>
    </div>
    <div className="circuit-toolbar circuit-selection">
      <label>{copy.select} <select value={selected ?? ""} onChange={event => setSelected(event.target.value || null)}>
        <option value="">—</option>
        {drawing.topology.components.map(item => <option value={item.id} key={item.id}>{item.id}</option>)}
      </select></label>
      {selected && <><button type="button" onClick={rotate}>{copy.rotate}</button>
        <button type="button" onClick={remove}>{copy.remove}</button></>}
    </div>
    <p className="circuit-message" role="status">{conflict ? copy.collision : drawing.topology.components.length ? "" : copy.blank}</p>
  </section>;
}
