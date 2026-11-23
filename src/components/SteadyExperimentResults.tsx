import { useId, useMemo, useState } from "react";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { EngineeringPlotData, PlotPoint } from "../engineering/plot";
import type { Complex } from "../models/circular-diagram";
import type { SteadyExperimentSample, SteadyExperimentSolution } from "../steady-line/experiment-solver";
import { phasorPolar } from "../steady-line/phasors";
import type { Language } from "../types";
import "./SteadyExperimentResults.css";

const copy = {
  ru: {
    results: "Эпюры и фазоры", position: "Координата x₀, м", section: "Секция",
    impedanceGap: "На этой координате ток равен нулю. Импеданс и его фаза не определены.",
    phaseGap: "Фаза нулевого импеданса не определена.",
    density: "Часть колебаний слишком частая для этой шкалы. Показания в точке x₀ рассчитаны напрямую.",
    range: "Фазоры для этой секции выходят за пределы численного диапазона.",
    voltage: "Фазоры напряжения", current: "Фазоры тока",
    real: "Действительная часть", imaginary: "Мнимая часть",
    waves: "Волна", magnitude: "Модуль", phase: "Фаза",
    total: "Суммарная", forward: "Падающая", backward: "Отражённая",
  },
  uk: {
    results: "Епюри та фазори", position: "Координата x₀, м", section: "Секція",
    impedanceGap: "На цій координаті струм дорівнює нулю. Імпеданс і його фаза не визначені.",
    phaseGap: "Фаза нульового імпедансу не визначена.",
    density: "Частина коливань надто швидка для цієї шкали. Покази в точці x₀ розраховано безпосередньо.",
    range: "Фазори для цієї секції виходять за межі числового діапазону.",
    voltage: "Фазори напруги", current: "Фазори струму",
    real: "Дійсна частина", imaginary: "Уявна частина",
    waves: "Хвиля", magnitude: "Модуль", phase: "Фаза",
    total: "Сумарна", forward: "Падаюча", backward: "Відбита",
  },
} as const;

const waves = ["total", "forward", "backward"] as const;
const colors = { total: "blue", forward: "steady-forward", backward: "green" } as const;
const magnitude = (value: Complex) => Math.hypot(value.re, value.im);
type WaveQuantity = "voltage" | "current";
type ScalarQuantity = "impedance-magnitude" | "impedance-phase" | "power";
type Section = SteadyExperimentSolution["sections"][number];
type Settings = {
  language: Language;
  solution: SteadyExperimentSolution;
  sectionId: string;
  xM: number;
  onPositionChange: (xM: number) => void;
};

const wavePlots = [
  { id: "voltage", title: "U(x)", axis: "|U|, V" },
  { id: "current", title: "I(x)", axis: "|I|, A" },
] as const;
const scalarPlots = [
  { id: "impedance-magnitude", title: "|Z(x)|", axis: "|Z|, Ω" },
  { id: "impedance-phase", title: "arg Z(x)", axis: "arg Z, °" },
  { id: "power", title: "P(x)", axis: "P, W" },
] as const;

function scalar(sample: SteadyExperimentSample, key: ScalarQuantity): number | null {
  if (key === "power") return sample.powerW;
  if (sample.impedanceOhm === null) return null;
  if (key !== "impedance-magnitude") return phasorPolar(sample.impedanceOhm).phaseDeg;
  const absolute = magnitude(sample.impedanceOhm);
  return Number.isFinite(absolute) ? absolute : null;
}

function sectionSamples(solution: SteadyExperimentSolution, section: Section) {
  const { id, lengthM, gammaPerM } = section;
  const budget = 1400;
  const target = Math.max(180, Math.ceil(lengthM * Math.max(Math.abs(gammaPerM?.im ?? 0) * 12, (gammaPerM?.re ?? 0) * 10)));
  const count = Math.min(budget, target);
  let poles: readonly number[] = [];
  let hideImpedance = false;
  try {
    poles = solution.poles(id);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "steady-limit") throw error;
    hideImpedance = true;
  }
  const positions = Array.from({ length: count + 1 }, (_, index) => index / count * lengthM);
  const coordinates = [...new Set([...positions, ...poles])].sort((left, right) => left - right);
  return {
    samples: coordinates.map(position => solution.sample(id, position)),
    poles: new Set(poles),
    limited: target > budget || hideImpedance,
    hideImpedance,
  };
}

function scalarSegments(samples: readonly SteadyExperimentSample[], poles: ReadonlySet<number>, quantity: ScalarQuantity) {
  const segments: PlotPoint[][] = [];
  let segment: PlotPoint[] = [];
  for (const sample of samples) {
    const value = poles.has(sample.xM) && quantity !== "power" ? null : scalar(sample, quantity);
    const previous = segment.at(-1)?.[1];
    if (value === null || !Number.isFinite(value) ||
        quantity === "impedance-phase" && previous !== undefined && Math.abs(value - previous) >= 180 - 1e-9) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (value !== null && Number.isFinite(value)) segment.push([sample.xM, value]);
  }
  if (segment.length) segments.push(segment);
  return segments;
}

function axisRange(curves: EngineeringPlotData["curves"], phase = false): [number, number] {
  if (phase) return [-180, 180];
  let min = 0, max = 0;
  for (const curve of curves) for (const [, value] of curve.points) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max || (min === 0 ? 1 : 0)];
}

function phaseLabel(angle: number | null, language: Language) {
  return angle === null ? "—" : formatEngineeringNumber(Math.abs(angle) < 1e-9 ? 0 : angle, language) + "°";
}

function PhasorDiagram({ quantity, values, xM, language }: {
  quantity: WaveQuantity;
  values: SteadyExperimentSample[WaveQuantity];
  xM: number;
  language: Language;
}) {
  const id = useId().replace(/:/g, "");
  const words = copy[language];
  const title = words[quantity];
  const unit = quantity === "voltage" ? "V" : "A";
  const vectors = waves.map(key => ({ key, value: values[key], polar: phasorPolar(values[key]) }));
  const scale = Math.max(...vectors.map(item => item.polar.magnitude)) || 1;
  return <figure className="steady-experiment-phasors" data-steady-phasors={quantity} data-coordinate={xM}>
    <figcaption>{title}</figcaption>
    <svg viewBox="0 0 276 192" role="img" aria-label={title}>
      <defs>{vectors.map(({ key }) => <marker key={key} id={id + key} viewBox="0 0 8 8" refX="7" refY="4"
        markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0 0L8 4L0 8Z" fill={`var(--${colors[key]})`} />
      </marker>)}</defs>
      <circle cx="138" cy="98" r="73" stroke="var(--line)" fill="none" />
      <path d="M36 98H236M138 12V180" stroke="var(--muted)" fill="none" />
      <text x="239" y="102" aria-label={words.real}>Re</text>
      <text x="143" y="17" aria-label={words.imaginary}>Im</text>
      {vectors.map(({ key, value, polar }) => <line key={key} data-wave-vector={key} x1="138" y1="98"
          x2={138 + (value.re / scale) * 73} y2={98 - (value.im / scale) * 73}
          stroke={`var(--${colors[key]})`} strokeWidth={key === "total" ? 3.2 : 2.2}
          strokeDasharray={key === "forward" ? "5 3" : key === "backward" ? "2 4" : undefined}
          markerEnd={polar.magnitude > 0 ? `url(#${id + key})` : undefined} />)}
    </svg>
    <table>
      <thead><tr><th scope="col">{words.waves}</th><th scope="col">{words.magnitude}</th><th scope="col">{words.phase}</th></tr></thead>
      <tbody>{vectors.map(({ key, polar }) => <tr key={key} data-wave-reading={key} data-wave-magnitude={polar.magnitude}
        data-wave-phase={polar.phaseDeg ?? ""}>
        <th scope="row" style={{ color: `var(--${colors[key]})` }}>{words[key]}</th>
        <td>{formatEngineeringValue(polar.magnitude, unit, language)}</td>
        <td>{phaseLabel(polar.phaseDeg, language)}</td>
      </tr>)}</tbody>
    </table>
  </figure>;
}

function SpatialPlot({ id, title, axis, curves, section, selected, language, onChange, phase = false }: {
  id: WaveQuantity | ScalarQuantity;
  title: string;
  axis: string;
  curves: EngineeringPlotData["curves"];
  section: Section;
  selected: readonly [number, number | null];
  language: Language;
  onChange: (xM: number) => void;
  phase?: boolean;
}) {
  const [xM, selectedValue] = selected;
  const [yMin, yMax] = axisRange(curves, phase);
  const plot = { xLabel: "x, m", xMax: section.lengthM, yLabel: axis, yMin, yMax, curves };
  const showLegend = id === "voltage" || id === "current";
  return <section className="steady-experiment-plot" data-steady-plot={id} data-coordinate={xM} aria-label={title}>
    <h3>{title}</h3>
    <EngineeringPlot plot={plot} language={language} label={title} compact
      domains={{ x: [0, section.lengthM], ...(phase ? { y: [-180, 180] as const } : {}) }}
      selected={selectedValue === null ? undefined : [xM, selectedValue]}
      verticals={[{ x: xM, label: "x₀" }]}
      onSelect={point => onChange(point[0])}
      selectAcrossCurves={!showLegend}
      showLegend={showLegend}
      legendClass="steady-experiment-legend" />
  </section>;
}

function SectionResults({ language, solution, section, xM, onPositionChange }: Settings & { section: Section }) {
  const words = copy[language];
  const position = Math.max(0, Math.min(section.lengthM, xM));
  const [draft, setDraft] = useState<string | null>(null);
  const series = useMemo(() => {
    try {
      const { samples, poles, limited, hideImpedance } = sectionSamples(solution, section);
      return {
        limited,
        waves: wavePlots.map(plot => waves.map(key => ({
          label: words[key], color: colors[key], dash: key !== "total",
          points: samples.map((sample): PlotPoint => [sample.xM, magnitude(sample[plot.id][key])]),
        }))),
        scalars: scalarPlots.map(plot => hideImpedance && plot.id !== "power" ? [] :
          scalarSegments(samples, poles, plot.id).map((points, index) => ({
            label: plot.title + " · " + (index + 1), color: "blue", points,
          }))),
      };
    } catch {
      return null;
    }
  }, [solution, section, words]);
  let selected: SteadyExperimentSample;
  try {
    selected = solution.sample(section.id, position);
  } catch {
    return <p role="alert">{words.range}</p>;
  }
  if (!series) return <p role="alert">{words.range}</p>;
  const voltage = magnitude(selected.voltage.total);
  const current = magnitude(selected.current.total);
  const impedance = scalar(selected, "impedance-magnitude");
  const phase = scalar(selected, "impedance-phase");
  const value = (quantity: number, unit: string) => formatEngineeringValue(quantity, unit, language);

  function choose(next: number) {
    setDraft(null);
    if (Number.isFinite(next)) onPositionChange(Math.max(0, Math.min(next, section.lengthM)));
  }

  function commitDraft() {
    if (draft === null) return;
    choose(draft.trim() ? Number(draft) : NaN);
  }

  return <section className="steady-experiment-results" data-steady-experiment-results data-section-id={section.id}
    data-coordinate={position} data-voltage-rms={voltage} data-current-rms={current}
    data-backward-voltage-rms={magnitude(selected.voltage.backward)}
    data-backward-current-rms={magnitude(selected.current.backward)}
    data-impedance-magnitude={impedance ?? ""} data-impedance-phase-deg={phase ?? ""} data-power-w={selected.powerW}>
    <header className="steady-experiment-readings">
      <div className="steady-experiment-readings-heading">
        <h2>{words.results} · {words.section} {section.id}</h2>
        <form onSubmit={event => { event.preventDefault(); commitDraft(); }}>
          <label>{words.position}
            <input data-steady-position type="number" step="any" min={0} max={section.lengthM}
              inputMode="decimal" value={draft ?? String(position)} onBlur={commitDraft}
              onKeyDown={event => {
                if (event.key === "Enter") { event.preventDefault(); choose(event.currentTarget.valueAsNumber); }
              }}
              onChange={event => setDraft(event.target.value)} />
          </label>
        </form>
      </div>
      <dl>
        <div><dt>|U| RMS</dt><dd>{value(voltage, "V")}</dd></div>
        <div><dt>|I| RMS</dt><dd>{value(current, "A")}</dd></div>
        <div><dt>|Z|</dt><dd>{impedance === null ? "—" : value(impedance, "Ω")}</dd></div>
        <div><dt>arg Z</dt><dd>{phaseLabel(phase, language)}</dd></div>
        <div><dt>P</dt><dd>{value(selected.powerW, "W")}</dd></div>
      </dl>
      {phase === null && <p role="status" data-steady-impedance-gap>{selected.impedanceOhm === null ? words.impedanceGap : words.phaseGap}</p>}
      {impedance === null && selected.impedanceOhm !== null && <p role="status">{words.range}</p>}
      {series.limited && <p className="steady-experiment-density">{words.density}</p>}
    </header>
    <div className="steady-experiment-results-grid">
      <div className="steady-experiment-epures">
        {wavePlots.map((plot, index) => <SpatialPlot key={plot.id} {...plot} section={section} language={language}
          curves={series.waves[index]} selected={[position, plot.id === "voltage" ? voltage : current]} onChange={choose} />)}
        {scalarPlots.map((plot, index) => <SpatialPlot key={plot.id} {...plot} section={section} language={language}
          curves={series.scalars[index]} selected={[position, scalar(selected, plot.id)]} onChange={choose}
          phase={plot.id === "impedance-phase"} />)}
      </div>
      <div className="steady-experiment-vectors">
        <PhasorDiagram quantity="voltage" language={language} values={selected.voltage} xM={position} />
        <PhasorDiagram quantity="current" language={language} values={selected.current} xM={position} />
      </div>
    </div>
  </section>;
}

export default function SteadyExperimentResults(settings: Settings) {
  const section = settings.solution.sections.find(({ id }) => id === settings.sectionId);
  return section ? <SectionResults key={section.id} {...settings} section={section} /> : null;
}
