import { Play, Pause, Square, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Complex } from "../fourier/math";
import { motionSampleCount, type MotionOptions, type PolygonMotion, type PolygonMotionResult } from "../fourier/polygon-motion-contract";
import { polygonMotionAt } from "../fourier/polygon-motion-math";
import { formatEngineeringNumber } from "../engineering/format";
import type { Language } from "../types";

const captions = {
  ru: { title: "Сложение движений", source: "Контур", sum: "Сумма движений", selected: "Траектория выбранной компоненты",
    phase: "Положение на обходе", play: "Запустить", pause: "Пауза" },
  uk: { title: "Додавання рухів", source: "Контур", sum: "Сума рухів", selected: "Траєкторія вибраної компоненти",
    phase: "Положення на обході", play: "Запустити", pause: "Пауза" },
} as const;

const width = 400;
const height = 350;
const padding = 21;
const plotNodes = Array.from({ length: motionSampleCount }, (_, index) => index / motionSampleCount);

function wrap(time: number) {
  return time - Math.floor(time);
}

function cornerTimes(component: PolygonMotion, { sides, aspect }: MotionOptions) {
  let vertices: number[];
  switch (component.shape) {
    case "circle": return [];
    case "rectangle": {
      const firstEdge = aspect / (2 * (aspect + 1));
      vertices = [0, firstEdge, .5, .5 + firstEdge];
      break;
    }
    default: {
      const edges = component.shape === "triangle" ? 3 : component.shape === "square" ? 4 : sides;
      vertices = Array.from({ length: edges }, (_, index) => index / edges);
    }
  }
  return vertices.map(vertex => wrap(component.direction * (vertex - component.phaseIndex / motionSampleCount)));
}

function chainAt(result: PolygonMotionResult, options: MotionOptions, position: number) {
  let point = result.center;
  return [point, ...result.components.map(component => {
    const offset = polygonMotionAt(component, options, position);
    point = { re: point.re + offset.re, im: point.im + offset.im };
    return point;
  })];
}

function trajectory(result: PolygonMotionResult, options: MotionOptions, selected: number) {
  const selection = result.components[selected];
  if (!selection) return [];
  const times = [...plotNodes, ...cornerTimes(selection, options)].sort((left, right) => left - right);
  return times.map(time => polygonMotionAt(selection, options, time));
}

function preparePlot(points: Complex[], result: PolygonMotionResult, options: MotionOptions, selected: number) {
  const times = [...plotNodes, ...result.components.flatMap(component => cornerTimes(component, options))]
    .sort((left, right) => left - right);
  const steps = times.map(time => chainAt(result, options, time));
  const sum = steps.map(chain => chain[chain.length - 1]);
  const selectedPath = trajectory(result, options, selected);
  const extents = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  function include({ re, im }: Complex) {
    extents.minX = Math.min(extents.minX, re);
    extents.maxX = Math.max(extents.maxX, re);
    extents.minY = Math.min(extents.minY, im);
    extents.maxY = Math.max(extents.maxY, im);
  }
  points.forEach(include);
  for (const step of steps) step.forEach(include);
  if (selectedPath.length) {
    const low = { re: Math.min(...selectedPath.map(point => point.re)), im: Math.min(...selectedPath.map(point => point.im)) };
    const high = { re: Math.max(...selectedPath.map(point => point.re)), im: Math.max(...selectedPath.map(point => point.im)) };
    for (const chain of steps) {
      const base = chain[selected];
      include({ re: base.re + low.re, im: base.im + low.im });
      include({ re: base.re + high.re, im: base.im + high.im });
    }
  }
  const scale = Math.min((width - 2 * padding) / Math.max(.1, extents.maxX - extents.minX),
    (height - 2 * padding) / Math.max(.1, extents.maxY - extents.minY));
  const centerX = (extents.minX + extents.maxX) / 2;
  const centerY = (extents.minY + extents.maxY) / 2;
  const map = ({ re, im }: Complex) => ({ x: width / 2 + (re - centerX) * scale, y: height / 2 - (im - centerY) * scale });
  function line(coordinates: Complex[], center?: Complex) {
    if (!coordinates.length) return "";
    return [...coordinates, coordinates[0]].map(point => {
      const { x, y } = map(center ? { re: point.re + center.re, im: point.im + center.im } : point);
      return `${x},${y}`;
    }).join(" ");
  }
  return { source: line(points), sum: line(sum), selectedPath, map, line };
}

export function PolygonMotionPlayback({ language, points, result, options, selected }: {
  language: Language;
  points: Complex[];
  result: PolygonMotionResult;
  options: MotionOptions;
  selected: number;
}) {
  const t = captions[language];
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    function update() {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    }
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0;
    let previous: number | undefined;
    function tick(now: number) {
      if (!document.hidden && previous !== undefined) {
        const elapsed = Math.max(0, Math.min(now - previous, 50));
        setPosition(current => wrap(current + elapsed / 6400));
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion]);

  const plot = useMemo(() => preparePlot(points, result, options, selected), [points, result, options, selected]);
  const chain = chainAt(result, options, position);
  const head = chain[chain.length - 1];
  const headPixel = plot.map(head);
  const selectionPath = plot.line(plot.selectedPath, chain[selected]);
  return <section className="motion-card motion-playback" aria-label={t.title}>
    <h2>{t.title}</h2>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.title} data-motion-result-plot
      data-motion-time={position} data-motion-head-re={head.re} data-motion-head-im={head.im}>
      <polyline className="motion-plot-source" points={plot.source} />
      <polyline className="motion-plot-sum" points={plot.sum} />
      {selectionPath && <polyline className="motion-plot-selected" points={selectionPath} data-motion-selected-path />}
      {chain.slice(1).map((point, index) => {
        const start = plot.map(chain[index]);
        const end = plot.map(point);
        return <line key={index} data-motion-vector={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
          className={index === selected ? "motion-vector motion-vector-selected" : "motion-vector"} />;
      })}
      <circle className="motion-plot-head" cx={headPixel.x} cy={headPixel.y} r="4.5" />
    </svg>
    <div className="motion-legend">
      <span className="motion-legend-source">{t.source}</span>
      <span className="motion-legend-sum">{t.sum}</span>
      {selectionPath && <span className="motion-legend-selected">{t.selected}</span>}
    </div>
    <div className="motion-playback-controls">
      {!reducedMotion && <button type="button" data-motion-play title={playing ? t.pause : t.play} aria-label={playing ? t.pause : t.play} onClick={() => setPlaying(current => !current)}>
        {playing ? <Pause size={18}/> : <Play size={18}/>}
      </button>}
      <button type="button" aria-label="Стоп" title="Стоп" onClick={() => {setPlaying(false); setPosition(0);}}><Square size={17}/></button>
      <button type="button" title={language === "ru" ? "Сброс фазы" : "Скинути фазу"} aria-label={language === "ru" ? "Сброс фазы" : "Скинути фазу"}
        onClick={() => setPosition(0)}><RotateCcw size={18}/></button>
      <label className="motion-field motion-phase"><span>{t.phase}</span>
        <input data-motion-phase type="range" min="0" max="1" step={1 / motionSampleCount} value={position}
          aria-valuetext={`${formatEngineeringNumber(position * 100, language)}%`}
          onChange={event => { setPlaying(false); setPosition(event.currentTarget.valueAsNumber); }} />
      </label>
    </div>
  </section>;
}
