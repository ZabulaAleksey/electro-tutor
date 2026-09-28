import { useRef, useState } from "react";
import { complexMagnitude, type Complex } from "../models/circular-diagram";
import { MAX_INPUT, PHASES, type Phase, type PhaseValues } from "../models/star-neutral";

type Copy = {
  impedancePlane: string; voltagePlot: string; currentPlot: string;
  fit: string; zoomIn: string; zoomOut: string; dragHint: string;
};

function toPoint(value: Complex, extent: number) {
  return { x: 250 + value.re / extent * 190, y: 250 - value.im / extent * 190 };
}

function niceStep(extent: number): number {
  const approximate = extent / 3;
  const power = 10 ** Math.floor(Math.log10(approximate));
  return [1, 2, 5, 10].map(factor => factor * power).find(step => step >= approximate) ?? power * 10;
}

function tickLabel(value: number): string {
  const absolute = Math.abs(value);
  return absolute >= 1e4 || absolute < 1e-3
    ? value.toExponential(1)
    : Number(value.toPrecision(3)).toString();
}

function Axes({ extent, unit }: { extent: number; unit: string }) {
  const step = niceStep(extent);
  const ticks: number[] = [];
  for (let tick = -Math.floor(extent / step) * step; tick <= extent; tick += step) ticks.push(tick);
  return <g className="star-axes">
    {ticks.map(tick => {
      const p = toPoint({ re: tick, im: tick }, extent);
      return <g key={tick}>
        <line className="star-grid-line" x1={p.x} y1="25" x2={p.x} y2="475" />
        <line className="star-grid-line" x1="25" y1={p.y} x2="475" y2={p.y} />
        {tick !== 0 && <><text x={p.x + 3} y="263">{tickLabel(tick)}</text><text x="254" y={p.y - 4}>{tickLabel(tick)}</text></>}
      </g>;
    })}
    <line className="star-axis" x1="25" y1="250" x2="475" y2="250" />
    <line className="star-axis" x1="250" y1="25" x2="250" y2="475" />
    <text className="star-axis-label" x="385" y="238">Re, {unit}</text>
    <text className="star-axis-label" x="257" y="39">Im, {unit}</text>
  </g>;
}

export function ImpedancePlane({ phases, onChange, copy }: {
  phases: PhaseValues; onChange: (phase: Phase, value: Complex) => void; copy: Copy;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ phase: Phase; extent: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragExtent, setDragExtent] = useState<number | null>(null);
  const largest = Math.max(...PHASES.flatMap(phase => [Math.abs(phases[phase].re), Math.abs(phases[phase].im)]));
  const dataExtent = largest === 0 ? 1 : Math.max(1e-6, largest * 1.25);
  const extent = dragExtent ?? dataExtent * zoom;
  const phaseClass: Record<Phase, string> = { A: "a", B: "b", C: "c" };

  const move = (phase: Phase, clientX: number, clientY: number, fixedExtent: number) => {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!matrix || !element) return;
    const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const re = Math.max(-MAX_INPUT, Math.min(MAX_INPUT, (local.x - 250) / 190 * fixedExtent));
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
      <Axes extent={extent} unit="Ω" />
      {PHASES.map(phase => {
        const p = toPoint(phases[phase], extent);
        const coincident = PHASES.filter(other => {
          const otherPoint = toPoint(phases[other], extent);
          return Math.hypot(p.x - otherPoint.x, p.y - otherPoint.y) < 18;
        });
        const rank = coincident.indexOf(phase);
        const overlapping = coincident.length > 1;
        const labelOffset = [[-26, -22], [20, -17], [20, 24]][rank];
        return <g key={phase} className={`star-point star-phase-${phaseClass[phase]}`}>
          <line x1="250" y1="250" x2={p.x} y2={p.y} />
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

export type PhasorVector = { id: string; label: string; value: Complex; kind: "source" | "load" | "neutral" };

export function PhasorPlot({ title, unit, vectors, ariaLabel }: {
  title: string; unit: string; vectors: PhasorVector[]; ariaLabel: string;
}) {
  const largest = Math.max(...vectors.map(vector => complexMagnitude(vector.value)));
  const extent = largest === 0 ? 1 : largest * 1.22;
  return <section className="star-card star-phasors">
    <h2>{title}</h2>
    <svg viewBox="0 0 500 500" role="img" aria-label={ariaLabel}>
      <Axes extent={extent} unit={unit} />
      <defs><marker id={`star-arrow-${unit}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L7 3.5 L0 7 Z" /></marker></defs>
      {vectors.map((vector, index) => {
        const p = toPoint(vector.value, extent);
        const labelShift = vector.kind === "source" ? -13 : vector.kind === "load" ? 15 : -2;
        return <g key={vector.id} className={`star-vector star-${vector.kind} star-vector-${vector.id.slice(-1).toLowerCase()}`}>
          <line x1="250" y1="250" x2={p.x} y2={p.y} markerEnd={`url(#star-arrow-${unit})`} />
          <text x={p.x + 8 + (index % 2) * 4} y={p.y + labelShift}>{vector.label}</text>
        </g>;
      })}
    </svg>
  </section>;
}
