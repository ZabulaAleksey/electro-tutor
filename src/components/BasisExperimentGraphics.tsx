import { useEffect, useMemo, useRef, useState } from "react";
import type { Language } from "../types";
import EngineeringPlot from "../engineering/EngineeringPlot";
import type { EngineeringPlotData } from "../engineering/plot";
import { svgPoint, usePointerStroke } from "../engineering/usePointerStroke";
import { basisContourMaxPoints, type BasisAnalysis, type ExperimentBoundary } from "../fourier/basis-experiment-contract";
import { epicycleChain, type Complex } from "../fourier/math";

const captions = {
  ru: {
    source: "Исходные отсчёты", reconstruction: "Частичная сумма", contribution: "Выбранный вклад",
    imaginary: "Мнимая часть суммы", signal: "График сигнала и частичной суммы",
    drawing: "Поле для рисования контура", cycles: "Эпициклы Фурье", phase: "Положение по параметру t",
    play: "Запустить", pause: "Пауза", reduced: "Положение можно менять ползунком.",
  },
  uk: {
    source: "Початкові відліки", reconstruction: "Часткова сума", contribution: "Вибраний внесок",
    imaginary: "Уявна частина суми", signal: "Графік сигналу й часткової суми",
    drawing: "Поле для малювання контуру", cycles: "Епіцикли Фур’є", phase: "Положення за параметром t",
    play: "Запустити", pause: "Пауза", reduced: "Положення можна змінювати повзунком.",
  },
} as const;

export function BasisSignalPlot({ language, boundary, samples, reconstruction, contribution }: {
  language: Language;
  boundary: ExperimentBoundary;
  samples: Complex[];
  reconstruction: Complex[];
  contribution: Complex[];
}) {
  const t = captions[language];
  const divisor = boundary === "periodic" ? samples.length : samples.length - 1;
  const points = (values: Complex[], key: keyof Complex = "re") => values.map((value, index) => [index / divisor, value[key]] as const);
  const curves: EngineeringPlotData["curves"] = [
    { label: t.source, points: points(samples), color: "muted", dash: true },
    { label: t.reconstruction, points: points(reconstruction), color: "blue" },
    { label: t.contribution, points: points(contribution), color: "orange", dash: true },
  ];
  if (reconstruction.some((value) => Math.abs(value.im) > 1e-10)) {
    curves.push({ label: t.imaginary, points: points(reconstruction, "im"), color: "green", dash: true });
  }
  const extent = curves.flatMap(({ points }) => points.map(([, value]) => value));
  return <EngineeringPlot label={t.signal} language={language} legendClass="basis-legend" plot={{
    xLabel: "t, 1", yLabel: "f(t), 1", xMax: 1, yMin: Math.min(0, ...extent), yMax: Math.max(0, ...extent), curves,
  }} />;
}

const boardCenter = 200;
const boardPadding = 174;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

function boardPoints(points: Complex[], closed: boolean, scale: number) {
  const path = closed && points.length > 2 ? [...points, points[0]] : points;
  return path.map(({ re, im }) => `${boardCenter + re * scale},${boardCenter - im * scale}`).join(" ");
}

export function BasisContourCanvas({ language, points, closed, reconstruction, contribution, onDraftStart, onDraw }: {
  language: Language;
  points: Complex[];
  closed: boolean;
  reconstruction?: Complex[];
  contribution?: Complex[];
  onDraftStart: () => void;
  onDraw: (points: Complex[]) => void;
}) {
  const t = captions[language];
  const svgRef = useRef<SVGSVGElement>(null);
  const previewRef = useRef<SVGPolylineElement>(null);
  const strokeScale = useRef<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const fittedScale = useMemo(() => {
    let extent = 1;
    for (const path of [points, reconstruction, contribution]) {
      for (const { re, im } of path ?? []) extent = Math.max(extent, Math.abs(re), Math.abs(im));
    }
    return boardPadding / extent;
  }, [points, reconstruction, contribution]);
  const scale = strokeScale.current ?? fittedScale;

  function finishDrawing() {
    strokeScale.current = null;
    setDrawing(false);
  }

  const { cancel, ...stroke } = usePointerStroke({
    svgRef,
    previewRef,
    pointLimit: basisContourMaxPoints,
    toPoint(event) {
      const svg = svgRef.current;
      if (!svg) return { x: boardCenter, y: boardCenter };
      const point = svgPoint(svg, event.clientX, event.clientY);
      const drawScale = strokeScale.current ?? scale;
      return {
        x: boardCenter + drawScale * clamp((point.x - boardCenter) / drawScale),
        y: boardCenter + drawScale * clamp((point.y - boardCenter) / drawScale),
      };
    },
    onStart: () => { strokeScale.current = scale; onDraftStart(); setDrawing(true); },
    onFinish: finishDrawing,
    onCommit(path) {
      const drawScale = strokeScale.current ?? scale;
      const stroke = path.map(({ x, y }) => ({ re: clamp((x - boardCenter) / drawScale), im: clamp((boardCenter - y) / drawScale) }));
      if (stroke.length > 1) onDraw(stroke);
    },
  });

  return <>
    <svg ref={svgRef} viewBox="0 0 400 400" className="basis-drawing" data-basis-draw data-point-count={points.length} data-draw-scale={scale}
      role="img" aria-label={t.drawing} tabIndex={0} {...stroke} onKeyDown={(event) => {
        if (event.key === "Escape" && drawing) { cancel(); finishDrawing(); }
      }}>
      <path className="basis-board-axes" d="M26 200H374M200 26V374" />
      <g className="basis-axis-labels" aria-hidden="true">
        <text x="205" y="215">0</text><text x="380" y="197">x</text><text x="204" y="19">y</text>
        <text x={boardCenter + scale - 4} y="216">1</text><text x="207" y={boardCenter - scale + 5}>1</text>
      </g>
      <rect className="basis-board-guide" x={boardCenter - scale} y={boardCenter - scale} width={2 * scale} height={2 * scale} rx="2" />
      <g className={drawing ? "basis-drawing-background" : undefined}>
        <polyline className="basis-path-source" points={boardPoints(points, closed, scale)} />
        {reconstruction && <polyline className="basis-path-result" points={boardPoints(reconstruction, closed, scale)} />}
        {contribution && <polyline className="basis-path-contribution" points={boardPoints(contribution, closed, scale)} />}
      </g>
      <polyline ref={previewRef} className="basis-path-preview" points="" />
    </svg>
    {reconstruction && <div className="basis-legend">
      <span><i className="basis-key-source" />{t.source}</span>
      <span><i className="basis-key-result" />{t.reconstruction}</span>
      <span><i className="basis-key-contribution" />{t.contribution}</span>
    </div>}
  </>;
}

export function BasisEpicycles({ language, analysis, boundary, sampleCount }: {
  language: Language;
  analysis: BasisAnalysis;
  boundary: ExperimentBoundary;
  sampleCount: number;
}) {
  const t = captions[language];
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduceMotion(query.matches); if (query.matches) setPlaying(false); };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || reduceMotion) return;
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      if (!document.hidden && previous !== 0) {
        const step = Math.min(50, now - previous) / 6500;
        setPosition((value) => (value + step) % 1);
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reduceMotion]);

  const { coefficients, scale } = useMemo(() => {
    const coefficients = analysis.terms.flatMap((term) => term.active && term.frequency !== undefined ? [{
      k: term.frequency, re: term.re, im: term.im, amplitude: term.amplitude, phase: Math.atan2(term.im, term.re),
    }] : []);
    return { coefficients, scale: 104 / Math.max(1e-9, coefficients.reduce((sum, term) => sum + term.amplitude, 0)) };
  }, [analysis]);
  const phase = boundary === "periodic" ? position : position * (sampleCount - 1) / sampleCount;
  const chain = epicycleChain(coefficients, phase);
  const endpoint = chain.at(-1)?.end ?? { re: 0, im: 0 };
  const cx = (x: number) => 190 + x * scale;
  const cy = (y: number) => 122 - y * scale;

  return <section className="basis-card basis-cycles" data-basis-epicycles data-head-re={endpoint.re} data-head-im={endpoint.im}>
    <h2>{t.cycles}</h2>
    <svg viewBox="0 0 380 244" role="img" aria-label={t.cycles} data-basis-endpoint-x={endpoint.re} data-basis-endpoint-y={endpoint.im}>
      <path d="M17 122H363M190 16V228" className="basis-board-axes" />
      {chain.filter((term) => term.radius * scale > .06).map(({ k, radius, start, end }) => <g key={k}>
        {k !== 0 && <circle data-basis-cycle={k} cx={cx(start.re)} cy={cy(start.im)} r={radius * scale} className="basis-cycle-circle" />}
        <line x1={cx(start.re)} y1={cy(start.im)} x2={cx(end.re)} y2={cy(end.im)} className="basis-cycle-vector" />
      </g>)}
      <circle className="basis-cycle-end" cx={cx(endpoint.re)} cy={cy(endpoint.im)} r="4" />
    </svg>
    <label className="basis-field"><span>{t.phase}</span>
      <input data-basis-phase type="range" min="0" max="1" step="any" value={position} onChange={(event) => {
        setPlaying(false); setPosition(event.currentTarget.valueAsNumber);
      }} />
    </label>
    {reduceMotion ? <p className="basis-note">{t.reduced}</p> : <button type="button" title={playing ? t.pause : t.play} data-basis-play onClick={() => setPlaying(!playing)}>
      {playing ? t.pause : t.play}
    </button>}
  </section>;
}
