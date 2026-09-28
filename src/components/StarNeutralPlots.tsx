import { useRef, useState } from "react";
import { complexMagnitude, type Complex } from "../models/circular-diagram";
import { MAX_INPUT, PHASES, type Phase, type PhaseValues, type StarResult } from "../models/star-neutral";

type Copy = {
  impedancePlane: string; combinedPlot: string; fit: string; zoomIn: string;
  zoomOut: string; dragHint: string; voltageScale: string; currentScale: string;
  sourceVectors: string; lineVectors: string; loadVectors: string;
  displacementVector: string; currentVectors: string;
};

function tickLabel(value: number): string {
  const absolute = Math.abs(value);
  return absolute >= 1e4 || absolute < 1e-3
    ? value.toExponential(1)
    : Number(value.toPrecision(3)).toString();
}

function zPoint(value: Complex, extent: number) {
  return { x: 50 + value.re / extent * 390, y: 250 - value.im / extent * 190 };
}

function ZAxes({ extent }: { extent: number }) {
  const power = 10 ** Math.floor(Math.log10(extent / 4));
  const step = [1, 2, 5, 10].map(factor => factor * power).find(value => value >= extent / 4) ?? power * 10;
  const horizontal = Array.from({ length: Math.floor(extent / step) + 1 }, (_, index) => index * step);
  const vertical = Array.from({ length: Math.floor(extent / step) * 2 + 1 }, (_, index) =>
    (index - Math.floor(extent / step)) * step);
  return <g className="star-axes">
    {horizontal.map(tick => {
      const x = zPoint({ re: tick, im: 0 }, extent).x;
      return <g key={`x-${tick}`}><line className="star-grid-line" x1={x} y1="40" x2={x} y2="460" />
        {tick > 0 && <text x={x + 2} y="265">{tickLabel(tick)}</text>}</g>;
    })}
    {vertical.map(tick => {
      const y = zPoint({ re: 0, im: tick }, extent).y;
      return <g key={`y-${tick}`}><line className="star-grid-line" x1="40" y1={y} x2="460" y2={y} />
        {tick !== 0 && <text x="54" y={y - 4}>{tickLabel(tick)}</text>}</g>;
    })}
    <line className="star-axis" x1="40" y1="250" x2="460" y2="250" />
    <line className="star-axis" x1="50" y1="30" x2="50" y2="470" />
    <text className="star-axis-label" x="365" y="239">R, Ω</text>
    <text className="star-axis-label" x="57" y="42">X, Ω</text>
    <text x="35" y="265">0</text>
  </g>;
}

export function ImpedancePlane({ phases, onChange, copy }: {
  phases: PhaseValues; onChange: (phase: Phase, value: Complex) => void; copy: Copy;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ phase: Phase; extent: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragExtent, setDragExtent] = useState<number | null>(null);
  const largest = Math.max(...PHASES.flatMap(phase => [phases[phase].re, Math.abs(phases[phase].im)]));
  const dataExtent = largest === 0 ? 1 : Math.max(1e-6, largest * 1.25);
  const extent = dragExtent ?? dataExtent * zoom;
  const phaseClass: Record<Phase, string> = { A: "a", B: "b", C: "c" };

  const move = (phase: Phase, clientX: number, clientY: number, fixedExtent: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const re = Math.max(0, Math.min(MAX_INPUT, (local.x - 50) / 390 * fixedExtent));
    const im = Math.max(-MAX_INPUT, Math.min(MAX_INPUT, (250 - local.y) / 190 * fixedExtent));
    onChange(phase, { re, im });
  };

  return <section className="star-card star-impedance">
    <div className="star-card-head"><h2>{copy.impedancePlane}</h2><div className="star-plot-actions">
      <button type="button" onClick={() => setZoom(value => Math.max(.125, value / 2))} aria-label={copy.zoomIn}>＋</button>
      <button type="button" onClick={() => setZoom(value => Math.min(16, value * 2))} aria-label={copy.zoomOut}>−</button>
      <button type="button" onClick={() => setZoom(1)}>{copy.fit}</button>
    </div></div>
    <svg ref={svg} viewBox="0 0 500 500" role="img" aria-label={copy.impedancePlane}
      onPointerMove={event => {
        if (!drag.current) return;
        event.preventDefault();
        move(drag.current.phase, event.clientX, event.clientY, drag.current.extent);
      }}
      onPointerUp={event => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setDragExtent(null);
      }}
      onPointerCancel={() => { drag.current = null; setDragExtent(null); }}>
      <ZAxes extent={extent} />
      {PHASES.map(phase => {
        const p = zPoint(phases[phase], extent);
        const coincident = PHASES.filter(other => {
          const otherPoint = zPoint(phases[other], extent);
          return Math.hypot(p.x - otherPoint.x, p.y - otherPoint.y) < 18;
        });
        const rank = coincident.indexOf(phase);
        const overlapping = coincident.length > 1;
        const labelOffset = [[-26, -22], [20, -17], [20, 24]][rank];
        return <g key={phase} className={`star-point star-phase-${phaseClass[phase]}`}>
          <line x1="50" y1="250" x2={p.x} y2={p.y} />
          <circle cx={p.x} cy={p.y} r={overlapping ? 18 - rank * 6 : 15} tabIndex={-1}
            onPointerDown={event => {
              event.preventDefault();
              drag.current = { phase, extent };
              svg.current?.setPointerCapture(event.pointerId);
              setDragExtent(extent);
            }} />
          <text x={p.x + (overlapping ? labelOffset[0] : 17)} y={p.y + (overlapping ? labelOffset[1] : -12)}>{phase}</text>
        </g>;
      })}
    </svg>
    <p className="star-hint">{copy.dragHint}</p>
  </section>;
}

type DiagramPoint = { x: number; y: number };
type VectorKind = "source" | "line" | "load" | "displacement" | "current";

function Vector({ id, from, to, label, kind, offset = 0 }: {
  id: string; from: DiagramPoint; to: DiagramPoint; label: string; kind: VectorKind; offset?: number;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const nx = length ? -dy / length : 0;
  const ny = length ? dx / length : -1;
  const mid = { x: (from.x + to.x) / 2 + nx * offset, y: (from.y + to.y) / 2 + ny * offset };
  return <g className={`star-vector star-${kind}`} data-vector={id}>
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
      markerEnd={length > 8 ? `url(#star-arrow-${kind})` : undefined} />
    <text x={mid.x + 3} y={mid.y - 5}>{label}</text>
  </g>;
}

export function StarVectorDiagram({ result, copy }: { result: StarResult; copy: Copy }) {
  const origin = { x: 250, y: 250 };
  const maxVoltage = Math.max(1, ...PHASES.map(phase => complexMagnitude(result.sources[phase])),
    complexMagnitude(result.displacement));
  const voltagePixels = 175 / (maxVoltage * 1.15);
  const maxCurrent = Math.max(1, ...PHASES.map(phase => complexMagnitude(result.currents[phase])),
    complexMagnitude(result.neutralCurrent));
  const currentPixels = 105 / maxCurrent;
  const placeVoltage = (value: Complex): DiagramPoint => ({
    x: origin.x + value.re * voltagePixels, y: origin.y - value.im * voltagePixels,
  });
  const neutral = placeVoltage(result.displacement);
  const source = Object.fromEntries(PHASES.map(phase => [phase, placeVoltage(result.sources[phase])])) as Record<Phase, DiagramPoint>;
  const placeCurrent = (value: Complex): DiagramPoint => ({
    x: neutral.x + value.re * currentPixels, y: neutral.y - value.im * currentPixels,
  });
  const linePairs = [["AB", "B", "A"], ["BC", "C", "B"], ["CA", "A", "C"]] as const;
  return <section className="star-card star-phasors">
    <h2>{copy.combinedPlot}</h2>
    <svg viewBox="0 0 500 500" role="img" aria-label={copy.combinedPlot}>
      <defs>{(["source", "line", "load", "displacement", "current"] as const).map(kind =>
        <marker key={kind} id={`star-arrow-${kind}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <path className={`star-marker star-marker-${kind}`} d="M0 0 L7 3.5 L0 7 Z" />
        </marker>)}</defs>
      <line className="star-guide" x1="35" y1="250" x2="465" y2="250" />
      <line className="star-guide" x1="250" y1="35" x2="250" y2="465" />
      {PHASES.map(phase => <Vector key={`source-${phase}`} id={`source-${phase}`} from={origin} to={source[phase]}
        label={`U${phase}`} kind="source" offset={phase === "A" ? -13 : -7} />)}
      {linePairs.map(([name, from, to]) => <Vector key={name} id={`line-${name}`} from={source[from]} to={source[to]}
        label={`U${name}`} kind="line" offset={name === "CA" ? -16 : 12} />)}
      <Vector id="displacement" from={origin} to={neutral} label="UₙN" kind="displacement" offset={-19} />
      {PHASES.map((phase, index) => <Vector key={`load-${phase}`} id={`load-${phase}`} from={neutral} to={source[phase]}
        label={`U${phase.toLowerCase()}`} kind="load" offset={index === 0 ? 13 : 11} />)}
      {PHASES.map((phase, index) => <Vector key={`current-${phase}`} id={`current-${phase}`} from={neutral}
        to={placeCurrent(result.currents[phase])} label={`I${phase}`} kind="current" offset={12 + index * 7} />)}
      <Vector id="current-N" from={neutral} to={placeCurrent(result.neutralCurrent)} label="Iₙ" kind="current" offset={-16} />
      {(["A", "B", "C", "n", "N"] as const).map(name => {
        const point = name === "N" ? origin : name === "n" ? neutral : source[name];
        const shift = name === "n" && Math.hypot(neutral.x - origin.x, neutral.y - origin.y) < 14 ? -16 : 0;
        return <g key={name} className="star-node"><circle cx={point.x} cy={point.y} r="4" />
          <text x={point.x + 7} y={point.y - 8 + shift}>{name}</text></g>;
      })}
    </svg>
    <div className="star-scales"><span>{copy.voltageScale}: {tickLabel(100 / voltagePixels)} V / 100 px</span>
      <span>{copy.currentScale}: {tickLabel(100 / currentPixels)} A / 100 px</span></div>
    <div className="star-legend">
      <span className="star-key-source">{copy.sourceVectors} UA · UB · UC</span>
      <span className="star-key-line">{copy.lineVectors} UAB · UBC · UCA</span>
      <span className="star-key-load">{copy.loadVectors} Ua · Ub · Uc</span>
      <span className="star-key-displacement">{copy.displacementVector} UₙN</span>
      <span className="star-key-current">{copy.currentVectors} IA · IB · IC · Iₙ</span>
    </div>
  </section>;
}
