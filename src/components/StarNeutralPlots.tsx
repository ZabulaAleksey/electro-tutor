import { complexPlanePoint } from "../engineering/geometry";
import { engineeringAxis } from "../engineering/scale";
import { formatEngineeringNumber } from "../engineering/format";
import type { Language } from "../types";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { complexMagnitude, type Complex } from "../models/circular-diagram";
import { LINE_PAIRS, MAX_INPUT, PHASES, type Phase, type PhaseValues, type StarResult } from "../models/star-neutral";
import type { getLocale } from "../i18n";

type Copy = ReturnType<typeof getLocale>["star"];
type ImpedanceKey = Phase | "N";
type Point = { x: number; y: number };
const zOrigin = { x: 250, y: 250 };
const width = 420;
const halfHeight = 166;

function ZAxes({ pixels, language }: { pixels: number; language: Language }) {
  const limit = width / pixels;
  const { step, ticks } = engineeringAxis(0, limit, { targetTicks: 6 });
  const xTicks = ticks.filter(t => t > 0 && t <= limit);
  const yLimit = halfHeight / pixels;
  const yTicks = engineeringAxis(-yLimit, yLimit, { step }).ticks.filter(t => Math.abs(t) <= yLimit && t !== 0);
  return <g className="star-axes">
    {xTicks.map(t => <g key={t} transform={`translate(${zOrigin.x + pixels * t} 0)`}>
      <path className="star-grid-line" d="M0 84 V416"/><text x="-2" y="267" textAnchor="end">{formatEngineeringNumber(t, language)}</text>
    </g>)}
    {yTicks.map(t => <g key={t} transform={`translate(0 ${zOrigin.y - pixels * t})`}>
      <path className="star-grid-line" d="M250 0 H670"/><text x="244" y="4" textAnchor="end">{formatEngineeringNumber(t, language)}</text>
    </g>)}
    <path className="star-axis" d="M250 84 V416 M250 250 H670"/>
    <text x="238" y="269">0</text><text className="star-axis-label" x="650" y="238">R, Ω</text>
    <text className="star-axis-label" x="250" y="72">X, Ω</text>
  </g>;
}

function fitScale(values: Complex[]) {
  const range = Math.max(1e-9, ...values.map(z => Math.max(z.re / width, Math.abs(z.im) / halfHeight)));
  return .84 / range;
}
type Gesture = {
  key: ImpedanceKey; pointer: number; offset: Point; pixels: number; last: Complex;
};

export function ImpedancePlane({ phases, neutral, onChange, copy, language, toggle, children }: {
  language: Language; phases: PhaseValues; neutral: Complex | null; copy: Copy;
  onChange: (key: ImpedanceKey, value: Complex) => void; toggle: ReactNode; children: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [zoom, setZoom] = useState(1);
  const [lockedScale, setLockedScale] = useState<number | null>(null);
  const keys: ImpedanceKey[] = neutral ? [...PHASES, "N"] : [...PHASES];
  const values = { ...phases, N: neutral ?? { re: 0, im: 0 } };
  const pixels = lockedScale ?? fitScale(keys.map(k => values[k])) * zoom;
  const point = (key: ImpedanceKey) => complexPlanePoint(values[key], zOrigin, pixels);
  const begin = (event: PointerEvent<SVGGElement>, key: ImpedanceKey) => {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const transform = svg.current?.getScreenCTM();
    if (!svg.current || !transform) return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    const p = point(key);
    gesture.current = { key, pointer: event.pointerId, pixels,
      offset: { x: local.x - p.x, y: local.y - p.y }, last: values[key] };
    svg.current.setPointerCapture(event.pointerId);
    setLockedScale(pixels);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    // Freeze the electrical scale, but follow the SVG's live position in the viewport.
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    drag.last = {
      re: Math.min(MAX_INPUT, Math.max(0, Math.min(width, local.x - drag.offset.x - zOrigin.x)) / drag.pixels),
      im: Math.max(-MAX_INPUT, Math.min(MAX_INPUT, Math.max(-halfHeight, Math.min(halfHeight, zOrigin.y - local.y + drag.offset.y)) / drag.pixels)),
    };
    onChange(drag.key, drag.last);
  };
  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    gesture.current = null;
    setZoom(drag.pixels / fitScale(keys.map(key => key === drag.key ? drag.last : values[key])));
    setLockedScale(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className="star-card star-impedance">
    <div className="star-card-head"><h2>{copy.impedancePlane}</h2><div className="star-plot-actions">
      <button type="button" onClick={() => setZoom(v => Math.min(64, v * 2))} aria-label={copy.zoomIn}>＋</button>
      <button type="button" onClick={() => setZoom(v => Math.max(1 / 64, v / 2))} aria-label={copy.zoomOut}>−</button>
      <button type="button" onClick={() => setZoom(1)}>{copy.fit}</button>
    </div></div>
    {toggle}
    <svg ref={svg} viewBox="185 52 512 385" role="img" aria-label={copy.impedancePlane}
      onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <ZAxes pixels={pixels} language={language} />
      {keys.map(key => {
        const p = point(key);
        const neighbors = keys.filter(other => Math.hypot(p.x - point(other).x, p.y - point(other).y) < 22);
        const rank = neighbors.indexOf(key);
        const offsets = [[-28, -22], [18, -17], [20, 26], [-28, 26]];
        const [dx, dy] = neighbors.length > 1 ? offsets[rank] : [16, -11];
        return <g key={key} className={`star-point star-phase-${key.toLowerCase()}`} onPointerDown={event => begin(event, key)}>
          {neighbors.length === 1 && <rect className="star-touch-target" x={p.x - 34} y={p.y - 34} width="68" height="68" fill="transparent"/>}
          <circle cx={p.x} cy={p.y} r={neighbors.length > 1 ? 18 - rank * 4 : 13}/>
          <text x={p.x + dx} y={p.y + dy}>{key}</text>
        </g>;
      })}
    </svg>
    <p className="star-hint">{copy.dragHint}</p>
    {children}
  </section>;
}

type Kind = "source" | "line" | "load" | "displacement" | "current";
type Arrow = { id: string; kind: Kind; from: Point; to: Point; label: string };
type Box = { x: number; y: number; w: number; h: number };

function placeLabel(occupied: Box[], candidates: Point[], label: string) {
  const w = label.length * 10 + 6, h = 22;
  let best = candidates[0], minimum = Infinity;
  for (const candidate of candidates) {
    const x = Math.max(3, Math.min(637 - w, candidate.x));
    const y = Math.max(h, Math.min(497, candidate.y));
    let overlap = 0;
    for (const b of occupied) {
      overlap += Math.max(0, Math.min(x + w, b.x + b.w) - Math.max(x, b.x)) *
        Math.max(0, Math.min(y + 4, b.y + b.h) - Math.max(y - h + 4, b.y));
    }
    if (overlap < minimum) { minimum = overlap; best = { x, y }; }
    if (!overlap) break;
  }
  occupied.push({ x: best.x, y: best.y - h + 4, w, h });
  return best;
}

export function StarVectorDiagram({ result, copy, language }: { result: StarResult; copy: Copy; language: Language }) {
  const origin = { x: 0, y: 0 };
  const maxVoltage = Math.max(1e-12, ...Object.values(result.sources).map(complexMagnitude), complexMagnitude(result.displacement));
  const maxCurrent = Math.max(1e-12, ...Object.values(result.currents).map(complexMagnitude), complexMagnitude(result.neutralCurrent));
  const voltageScale = 200 / maxVoltage;
  const currentScale = 150 / maxCurrent;
  const neutral = complexPlanePoint(result.displacement, origin, voltageScale);
  const sources = Object.fromEntries(PHASES.map(k => [k, complexPlanePoint(result.sources[k], origin, voltageScale)])) as Record<Phase, Point>;
  const nodes = { N: origin, n: neutral, ...sources };
  const arrows: Arrow[] = [];
  for (const k of PHASES) {
    arrows.push({ id: `source-${k}`, kind: "source", from: origin, to: sources[k], label: `U${k}` });
    arrows.push({ id: `load-${k}`, kind: "load", from: neutral, to: sources[k], label: `U${k.toLowerCase()}` });
    arrows.push({ id: `current-${k}`, kind: "current", from: neutral, to: complexPlanePoint(result.currents[k], neutral, currentScale), label: `I${k}` });
  }
  for (const [name, to, from] of LINE_PAIRS) arrows.push({ id: `line-${name}`, kind: "line", from: sources[from], to: sources[to], label: `U${name}` });
  arrows.push({ id: "displacement", kind: "displacement", from: origin, to: neutral, label: "UₙN" },
    { id: "current-N", kind: "current", from: neutral, to: complexPlanePoint(result.neutralCurrent, neutral, currentScale), label: "Iₙ" });

  const ends = [origin, ...arrows.map(a => a.to)];
  const xs = ends.map(p => p.x), ys = ends.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - left), h = Math.max(1, Math.max(...ys) - top);
  const fit = Math.min(554 / w, 415 / h);
  const screen = (p: Point) => ({ x: 320 + (p.x - left - w / 2) * fit, y: 250 + (p.y - top - h / 2) * fit });
  const occupied: Box[] = Object.values(nodes).map(p => ({ x: screen(p).x - 7, y: screen(p).y - 7, w: 14, h: 14 }));
  const nodeLabels = Object.entries(nodes).map(([name, value]) => {
    const p = screen(value);
    const label = placeLabel(occupied, [[8,-8],[-16,18],[8,22],[-16,-8]].map(([dx,dy]) => ({ x: p.x + dx, y: p.y + dy })), name);
    return { name, p, label };
  });
  // Reserve small samples along every segment so neighbouring arrows do not cross labels.
  for (const arrow of arrows) {
    const a = screen(arrow.from), b = screen(arrow.to);
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 18);
    for (let i = 1; i < steps; i++) {
      occupied.push({ x: a.x + (b.x - a.x) * i / steps - 2, y: a.y + (b.y - a.y) * i / steps - 2, w: 4, h: 4 });
    }
  }
  const vectors = arrows.map(a => {
    const from = screen(a.from), to = screen(a.to);
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const candidates = [.52,.34,.7,.22,.82].flatMap(t => [12,-12,26,-26].map(d => ({
      x: from.x + dx * t - dy / (length || 1) * d - a.label.length * 4,
      y: from.y + dy * t + dx / (length || 1) * d + 4,
    })));
    const label = length > 2 ? placeLabel(occupied, candidates, a.label) : null;
    return { arrow: a, from, to, length, label };
  });
  const zero = screen(origin);
  return <section className="star-card star-phasors">
    <h2>{copy.combinedPlot}</h2>
    <svg viewBox="0 0 640 500" role="img" aria-label={copy.combinedPlot}>
      <defs>
        <pattern id="star-grid" width="40" height="40" patternUnits="userSpaceOnUse" x={zero.x} y={zero.y}>
          <path className="star-grid-line" d="M40 0 H0 V40" fill="none"/>
        </pattern>
        {(["source","line","load","displacement","current"] as const).map(kind =>
          <marker key={kind} id={`star-arrow-${kind}`} markerWidth="12" markerHeight="10" refX="12" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path className={`star-marker star-marker-${kind}`} d="M0 0 L12 5 L0 10 Z"/>
          </marker>)}
      </defs>
      <rect width="640" height="500" fill="url(#star-grid)"/>
      <path className="star-axis" opacity=".33" d={`M0 ${zero.y} H640 M${zero.x} 0 V500`}/>
      {vectors.map(({ arrow, from, to, length }) => <g key={arrow.id} className={`star-vector star-${arrow.kind}`} data-vector={arrow.id}>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={length > 8 ? `url(#star-arrow-${arrow.kind})` : undefined}/>
      </g>)}
      {vectors.map(({ arrow, label }) => label && <g key={arrow.id} className={`star-vector star-${arrow.kind}`}>
        <text x={label.x} y={label.y}>{arrow.label}</text>
      </g>)}
      {nodeLabels.map(({name, p, label}) => <g key={name} className="star-node">
        <circle cx={p.x} cy={p.y} r="4"/><text x={label.x} y={label.y}>{name}</text>
      </g>)}
    </svg>
    <div className="star-scales">{[[copy.voltageScale, voltageScale, "V"], [copy.currentScale, currentScale, "A"]].map(([label, scale, unit]) =>
      <span key={label}>{label}: {formatEngineeringNumber(40 / (Number(scale) * fit), language)} {unit} / {language === "ru" ? "клетку" : "клітинку"}</span>)}</div>
    <p className="star-hint">{language === "ru"
      ? "N — нейтраль источника, n — нейтраль нагрузки."
      : "N — нейтраль джерела, n — нейтраль навантаження."}</p>
    <div className="star-legend">
      <span className="star-key-source">{copy.sourceVectors} UA · UB · UC</span>
      <span className="star-key-line">{copy.lineVectors} UAB · UBC · UCA</span>
      <span className="star-key-load">{copy.loadVectors} Ua · Ub · Uc</span>
      <span className="star-key-displacement">{copy.displacementVector} UₙN</span>
      <span className="star-key-current">{copy.currentVectors} IA · IB · IC · Iₙ</span>
    </div>
  </section>;
}
