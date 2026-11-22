import { memo, useId, useMemo, useRef, useState } from "react";
import { svgPoint, usePointerStroke } from "../engineering/usePointerStroke";
import type { Point2, RollingRun } from "../rolling/lab-model";

const middle = 160;
const unit = 70;
const clamp = (value: number) => Math.max(-2, Math.min(2, value));
const drawingPoint = ([x, y]: Point2) => [middle + x * unit, middle - y * unit];
const path = (points: readonly number[][]) => points.map(point => point.join(",")).join(" ");

export const RollingDrawing = memo(function RollingDrawing({ label, points, onStart, onDraw }: {
  label: string; points: Point2[]; onStart: () => void; onDraw: (points: Point2[]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const preview = useRef<SVGPolylineElement>(null);
  const grid = useId();
  const [drafting, setDrafting] = useState(false);
  const { cancel, ...pointer } = usePointerStroke({
    svgRef: svg, previewRef: preview, pointLimit: 512,
    toPoint(event) {
      if (!svg.current) return { x: middle, y: middle };
      const point = svgPoint(svg.current, event.clientX, event.clientY);
      return {
        x: middle + unit * clamp((point.x - middle) / unit),
        y: middle + unit * clamp((point.y - middle) / unit),
      };
    },
    onStart() { setDrafting(true); onStart(); },
    onFinish() { setDrafting(false); },
    onCommit(stroke) { onDraw(stroke.map(({ x, y }) => [clamp((x - middle) / unit), clamp((middle - y) / unit)])); },
  });
  const source = useMemo(() => path(points.map(drawingPoint)), [points]);
  const start = points.length ? drawingPoint(points[0]) : undefined;
  const end = points.length > 1 ? drawingPoint(points.at(-1)!) : undefined;

  return <svg ref={svg} viewBox="0 0 320 320" role="img" aria-label={label} tabIndex={0}
    className="rolling-drawing" data-rolling-drawing data-point-count={points.length}
    {...pointer} onKeyDown={event => {
      if (event.key === "Escape" && drafting) {
        cancel();
        setDrafting(false);
      }
    }}>
    <defs><pattern id={grid} width="20" height="20" patternUnits="userSpaceOnUse">
      <path className="rolling-grid-line" d="M20 0H0V20" />
    </pattern></defs>
    <rect x="20" y="20" width="280" height="280" rx="4" fill={`url(#${grid})`} />
    <path className="rolling-grid-line rolling-axis" d="M20 160H300M160 20V300" />
    {!drafting && <>
      <polyline className="rolling-source-line" points={source} />
      {start && <circle className="rolling-source-start" cx={start[0]} cy={start[1]} r="4" />}
      {end && <circle className="rolling-source-end" cx={end[0]} cy={end[1]} r="4" />}
    </>}
    <polyline ref={preview} className="rolling-source-line" points="" />
  </svg>;
});

function plotCoordinates(run: RollingRun) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const series of [run.target, run.contacts, run.requested ?? []]) {
    for (const [x, y] of series) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const scale = Math.min(380 / Math.max(.05, maxX - minX), 145 / Math.max(.05, maxY - minY));
  return ([x, y]: Point2): Point2 => [220 + (x - (minX + maxX) / 2) * scale, 100 - (y - (minY + maxY) / 2) * scale];
}

export function RollingComparison({ run, index, labels }: {
  run: RollingRun; index: number; labels: { plot: string; requested: string; target: string; actual: string };
}) {
  const points = useMemo(() => {
    const toPlot = plotCoordinates(run);
    return {
      target: path(run.target.map(toPlot)), actual: path(run.contacts.map(toPlot)),
      requested: run.requested && path(run.requested.map(toPlot)), toPlot,
    };
  }, [run]);
  const [x, y] = points.toPlot(run.contacts[index]);
  return <>
    <svg viewBox="0 0 440 200" role="img" aria-label={labels.plot} className="rolling-comparison">
      <path className="rolling-grid-line" d="M20 50H420M20 100H420M20 150H420M100 15V185M220 15V185M340 15V185" />
      {points.requested && <polyline className="rolling-requested-line" points={points.requested} />}
      <polyline className="rolling-source-line" points={points.target} />
      <polyline className="rolling-actual-line" points={points.actual} />
      <circle className="rolling-contact" cx={x} cy={y} r="5" data-rolling-contact />
    </svg>
    <ul className="rolling-legend">
      {points.requested && <li className="rolling-legend-requested">{labels.requested}</li>}
      <li className="rolling-legend-target">{labels.target}</li>
      <li className="rolling-legend-actual">{labels.actual}</li>
    </ul>
  </>;
}
