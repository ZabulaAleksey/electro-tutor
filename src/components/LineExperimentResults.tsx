import { useEffect, useMemo, useRef, useState } from "react";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { downloadSvg } from "../engineering/exportSvg";
import { formatEngineeringValue } from "../engineering/format";
import type { EngineeringPlotData, PlotPoint } from "../engineering/plot";
import { at, spatial, timeTrace, type Network, type Quantity, type WaveRun } from "../transient/network";
import { networkError } from "../transient/network-copy";
import type { Language } from "../types";
import "./LineExperimentResults.css";

type Observation = { xM: number; timeS: number };
type ResultsProps = {
  language: Language;
  sectionId: string;
  model: Network;
  onBack: () => void;
  durationS: number;
  onDurationChange: (seconds: number) => void;
  observation: Observation;
  onObservationChange: (value: Observation) => void;
};
type WorkerReply = { id: number; progress: number } | { id: number; run: WaveRun } | { id: number; error: string };
type Calculation = { model: Network } & ({ run: WaveRun } | { progress: number } | { error: string });
type Measure = "u" | "i";
type Coordinate = "x" | "t";

const copy = {
  ru: {
    back: "Назад к схеме", title: "Переходные процессы", wait: "Расчёт волн", worker: "Не удалось запустить расчёт волн.",
    animation: "Распространение волн", position: "Координата x", time: "Время t", duration: "Длительность, с",
    launch: "Пуск", pause: "Пауза", stop: "Стоп", apply: "Применить", section: "Локальная координата от начала секции",
    total: "Сумма", forward: "Падающая", backward: "Отражённая", plots: "Эпюры", noSection: "Секция отсутствует в схеме.",
  },
  uk: {
    back: "Назад до схеми", title: "Перехідні процеси", wait: "Розрахунок хвиль", worker: "Не вдалося запустити розрахунок хвиль.",
    animation: "Поширення хвиль", position: "Координата x", time: "Час t", duration: "Тривалість, с",
    launch: "Пуск", pause: "Пауза", stop: "Стоп", apply: "Застосувати", section: "Локальна координата від початку секції",
    total: "Сума", forward: "Падаюча", backward: "Відбита", plots: "Епюри", noSection: "Секція відсутня у схемі.",
  },
};

const waveQuantities: Record<Measure, readonly [Quantity, Quantity, Quantity]> = {
  u: ["u", "forward", "backward"],
  i: ["i", "forwardI", "backwardI"],
};

const plotCoordinates = [["x", "u"], ["x", "i"], ["t", "u"], ["t", "i"]] as const;

function clamp(value: number, upper: number) {
  return Math.max(0, Math.min(value, upper));
}

function selectedSectionRun(run: WaveRun, sectionId: string): WaveRun | undefined {
  const index = run.config.sections.findIndex(({ id }) => id === sectionId);
  if (index === -1) return undefined;

  // The existing trace readers treat a section junction as part of the
  // preceding section. Both port histories here belong to the selected section,
  // so even x=0 and x=L use the selected side of a junction.
  return {
    ...run,
    config: { ...run.config, sections: [run.config.sections[index]] },
    ports: run.ports.slice(index * 2, index * 2 + 2),
  };
}

function makePlot(axis: Coordinate, measure: Measure, maximum: number, range: readonly [number, number],
  data: readonly (readonly PlotPoint[])[], labels: typeof copy.ru): EngineeringPlotData {
  return {
    xLabel: axis === "x" ? "x, m" : "t, s",
    yLabel: measure === "u" ? "U, V" : "I, A",
    xMax: maximum,
    yMin: range[0],
    yMax: range[1],
    curves: [
      { label: labels.total, color: "blue", points: data[0] },
      { label: labels.forward, color: "red", dash: true, points: data[1] },
      { label: labels.backward, color: "green", dash: true, points: data[2] },
    ],
  };
}

function WaveAnimation({ language, sectionId, samples, length, xM, scale }: {
  language: Language;
  sectionId: string;
  samples: readonly (readonly PlotPoint[])[];
  length: number;
  xM: number;
  scale: number;
}) {
  const t = copy[language];
  const x = (value: number) => 38 + value / length * 444;
  const paths = ([samples[1], samples[2]] as const).map((points, index) => {
    const baseline = 72 + index * 54;
    return points.map(([pos, value]) => `${x(pos).toFixed(2)},${(baseline - value / scale * 20).toFixed(2)}`).join(" ");
  });
  return <svg data-line-a-wave className="line-a-wave" viewBox="0 0 520 168" role="img" aria-label={`${t.animation} · ${sectionId}`}>
    <rect x={38} y={45} width={444} height={108} rx={8} className="line-a-wave-bed" />
    <path d="M38 72H482M38 126H482" className="line-a-wave-guides" />
    <path d={`M${x(xM)} 45V153`} className="line-a-wave-probe" />
    <text x={38} y={29} className="line-a-wave-forward">{t.forward} →</text>
    <text x={482} y={29} textAnchor="end" className="line-a-wave-backward">← {t.backward}</text>
    <polyline data-line-a-wave-path="forward" className="line-a-wave-forward" points={paths[0]} />
    <polyline data-line-a-wave-path="backward" className="line-a-wave-backward" points={paths[1]} />
    <text x={x(xM)} y={165} textAnchor="middle" className="line-a-wave-marker">x</text>
  </svg>;
}

export default function LineExperimentResults({ language, sectionId, model, onBack, durationS, onDurationChange,
  observation, onObservationChange }: ResultsProps) {
  const t = copy[language];
  const [calculation, setCalculation] = useState<Calculation>();
  const [playback, setPlayback] = useState<{ model: Network; sectionId: string; startS: number }>();
  const [durationDraft, setDurationDraft] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const liveObservation = useRef({ observation, publish: onObservationChange });

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    liveObservation.current = { observation, publish: onObservationChange };
  }, [observation, onObservationChange]);

  useEffect(() => {
    const id = 1;
    let active = true;
    let worker: Worker;
    try {
      worker = new Worker(new URL("../transient/network.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setCalculation({ model, error: "worker-launch" });
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (!active || data.id !== id) return;
      if ("progress" in data) setCalculation({ model, progress: data.progress });
      else if ("run" in data) setCalculation({ model, run: data.run });
      else setCalculation({ model, error: data.error });
    };
    worker.onerror = () => {
      if (active) setCalculation({ model, error: "worker-launch" });
    };
    worker.postMessage({ id, config: model, reportDevices: false });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [model]);

  const result = calculation?.model === model ? calculation : undefined;
  const run = result && "run" in result ? result.run : undefined;
  const sectionRun = useMemo(() => run && selectedSectionRun(run, sectionId), [run, sectionId]);
  const modelSection = model.sections.find(({ id }) => id === sectionId);
  const length = modelSection?.lengthM ?? 0;
  const xM = clamp(observation.xM, length);
  const timeS = clamp(observation.timeS, durationS);
  const activePlayback = playback?.model === model && playback.sectionId === sectionId ? playback : undefined;

  useEffect(() => {
    if (!activePlayback || !sectionRun) return;
    const start = performance.now();
    const startS = activePlayback.startS;
    const secondsPerMillisecond = durationS / 8_000;
    let lastFrame = start;
    let frame: number;
    function tick(now: number) {
      const time = clamp(startS + (now - start) * secondsPerMillisecond, durationS);
      if (now - lastFrame >= 32 || time >= durationS) {
        const { observation: current, publish } = liveObservation.current;
        publish({ xM: current.xM, timeS: time });
        lastFrame = now;
      }
      if (time < durationS) frame = requestAnimationFrame(tick);
      else setPlayback(undefined);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activePlayback, sectionRun, durationS]);

  const spatialData = useMemo(() => sectionRun && {
    u: waveQuantities.u.map(quantity => spatial(sectionRun, timeS, quantity)),
    i: waveQuantities.i.map(quantity => spatial(sectionRun, timeS, quantity)),
  }, [sectionRun, timeS]);
  const temporalData = useMemo(() => sectionRun && {
    u: waveQuantities.u.map(quantity => timeTrace(sectionRun, xM, quantity)),
    i: waveQuantities.i.map(quantity => timeTrace(sectionRun, xM, quantity)),
  }, [sectionRun, xM]);
  const reading = sectionRun && at(sectionRun, xM, timeS);
  const numericError = result && "error" in result ? result.error : undefined;
  const error = !modelSection ? t.noSection : numericError === "worker-launch" ? t.worker
    : numericError ? networkError(numericError, language) : undefined;
  const ready = !!sectionRun && !error;

  function seek(seconds: number) {
    setPlayback(undefined);
    onObservationChange({ xM, timeS: clamp(seconds, durationS) });
  }
  function probe(position: number) {
    onObservationChange({ xM: clamp(position, length), timeS });
  }
  function play() {
    const startS = timeS >= durationS ? 0 : timeS;
    if (startS !== timeS) onObservationChange({ xM, timeS: startS });
    setPlayback({ model, sectionId, startS });
  }
  function applyDuration() {
    if (durationDraft === undefined) return;
    const seconds = Number(durationDraft);
    if (!Number.isFinite(seconds) || seconds < 1e-9 || seconds > 10) return;
    setPlayback(undefined);
    setDurationDraft(undefined);
    onDurationChange(seconds);
  }

  return <section data-line-a-results data-section-id={sectionId} data-calculation-ready={String(ready)}
    data-solver-method={sectionRun?.method} data-time-s={timeS} data-position-m={xM} data-u={reading?.u} data-i={reading?.i}
    data-wave-forward={reading?.forward} data-wave-backward={reading?.backward} className="line-a-results">
    <header className="line-a-results-heading">
      <button data-line-a-back type="button" onClick={onBack}>← {t.back}</button>
      <h2 ref={heading} tabIndex={-1}>{t.title} · {sectionId}</h2>
    </header>
    <div className="line-a-transport">
      <div className="line-a-playback">
        <button data-line-a-play type="button" onClick={play} disabled={!ready || !!activePlayback}>{t.launch}</button>
        <button data-line-a-pause type="button" onClick={() => setPlayback(undefined)} disabled={!activePlayback}>{t.pause}</button>
        <button data-line-a-stop type="button" onClick={() => seek(0)} disabled={!activePlayback && timeS === 0}>{t.stop}</button>
      </div>
      <form className="line-a-duration" onSubmit={event => { event.preventDefault(); applyDuration(); }}>
        <label>{t.duration}
          <input data-line-a-duration type="number" min={1e-9} max={10} step="any" required
            value={durationDraft ?? String(durationS)} onChange={event => setDurationDraft(event.target.value)} />
        </label>
        <button type="submit" disabled={durationDraft === undefined}>{t.apply}</button>
      </form>
      <label className="line-a-slider">
        <span>{t.time} = {formatEngineeringValue(timeS, "s", language)}</span>
        <input data-line-a-time aria-label={t.time} type="range" min={0} max={durationS}
          step={durationS / 2_000} value={timeS} disabled={!ready} onChange={event => seek(Number(event.target.value))} />
      </label>
      <label className="line-a-slider">
        <span>{t.position} = {formatEngineeringValue(xM, "m", language)}</span>
        <input data-line-a-position aria-label={t.position} title={t.section} type="range" min={0} max={length}
          step={length / 1_000 || 1} value={xM} disabled={!ready} onChange={event => probe(Number(event.target.value))} />
      </label>
    </div>
    {error && <p role="alert" className="line-a-calculation-error">{error}</p>}
    {!error && !ready && <p role="status" className="line-a-calculation-progress">
      <progress aria-label={t.wait} max={1} value={result && "progress" in result ? result.progress : undefined} /> {t.wait}
    </p>}
    {ready && reading && spatialData && temporalData && sectionRun &&
      <>
        <section className="line-a-animation" aria-label={t.animation}>
          <div className="line-a-readings">
            <strong>U = {formatEngineeringValue(reading.u, "V", language)}</strong>
            <strong>I = {formatEngineeringValue(reading.i, "A", language)}</strong>
          </div>
          <WaveAnimation language={language} sectionId={sectionId} length={length} xM={xM} samples={spatialData.u}
            scale={Math.max(1e-12, ...sectionRun.rangeU.map(Math.abs))} />
        </section>
        <div role="group" className="line-a-plots" aria-label={t.plots}>
          {plotCoordinates.map(([axis, measure]) => {
            const id = `${measure}-${axis}`;
            const label = `${measure.toUpperCase()}(${axis})`;
            const range = measure === "u" ? sectionRun.rangeU : sectionRun.rangeI;
            const domainEnd = axis === "x" ? length : durationS;
            return <ResultPlot key={id} id={id} label={label} language={language}
              plot={makePlot(axis, measure, domainEnd, range, (axis === "x" ? spatialData : temporalData)[measure], t)}
              selected={[axis === "x" ? xM : timeS, reading[measure]]}
              onSelect={axis === "x" ? probe : seek} sectionId={sectionId} />;
          })}
        </div>
      </>}
  </section>;
}

function ResultPlot({ id, label, language, plot, selected, onSelect, sectionId }: {
  id: string;
  label: string;
  language: Language;
  plot: EngineeringPlotData;
  selected: PlotPoint;
  onSelect: (coordinate: number) => void;
  sectionId: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  function exportPlot() {
    const svg = body.current?.querySelector("svg");
    if (svg) downloadSvg(svg, `electrotutor-${sectionId}-${id}.svg`);
  }
  return <section className="line-a-result-plot" data-line-a-plot={id} aria-label={label}>
    <div className="line-a-result-plot-heading">
      <h3>{label}</h3>
      <button data-line-a-export-svg={id} aria-label={`SVG ${label}`} type="button" onClick={exportPlot}>SVG</button>
    </div>
    <div ref={body}>
      <EngineeringPlot plot={plot} label={label} language={language} selected={selected}
        onSelect={point => onSelect(point[0])} legendClass="line-a-plot-legend" />
    </div>
  </section>;
}
