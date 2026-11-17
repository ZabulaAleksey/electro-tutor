import { useEffect, useId, useMemo, useState } from "react";
import CircuitEditor from "../circuit/CircuitEditor";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { EngineeringPlotData } from "../engineering/plot";
import type { Complex } from "../models/circular-diagram";
import { calculateCascade } from "../steady-line/cascade";
import { evaluateSteadyCircuit, steadyCircuitMode } from "../steady-line/circuit-mode";
import { inspectLinePhasors, phasorPolar, solvePhasorCascade } from "../steady-line/phasors";
import type { Language } from "../types";
import "./SteadyLineLab.css";

const initialDocument = steadyCircuitMode.createDefaultDocument();
const words = {
  ru: {
    frequency: "Частота, Hz", ending: "Окончание", circuit: "По схеме", matched: "Согласованное", short: "КЗ", open: "Обрыв",
    real: "Действительная часть", imaginary: "Мнимая часть", coordinate: "Координата x", magnitude: "Модуль", phase: "Фаза",
    forward: "Прямая", backward: "Обратная", total: "Суммарная", waves: "Волна", shift: "Разность фаз",
    voltage: "Векторы напряжения", current: "Векторы тока", editor: "Схема опыта",
    invalidGraph: "Проверьте схему. Нужны источник ЭДС, последовательность секций линии и линейные элементы R, L, C.",
    invalidCalculation: "Расчёт недоступен для этих параметров. Проверьте частоту и окончание линии.",
    explanation: "Даже при постоянных модулях двух волн их фазы меняются по координате. От разности фаз зависит модуль суммы.",
    sampling: "Отдельные колебания слишком плотны для эпюры. Фазоры в заданной координате рассчитываются напрямую.",
  },
  uk: {
    frequency: "Частота, Hz", ending: "Закінчення", circuit: "За схемою", matched: "Узгоджене", short: "КЗ", open: "Обрив",
    real: "Дійсна частина", imaginary: "Уявна частина", coordinate: "Координата x", magnitude: "Модуль", phase: "Фаза",
    forward: "Пряма", backward: "Зворотна", total: "Сумарна", waves: "Хвиля", shift: "Різниця фаз",
    voltage: "Вектори напруги", current: "Вектори струму", editor: "Схема досліду",
    invalidGraph: "Перевірте схему. Потрібні джерело ЕРС, послідовність секцій лінії та лінійні елементи R, L, C.",
    invalidCalculation: "Розрахунок недоступний для цих параметрів. Перевірте частоту й закінчення лінії.",
    explanation: "Навіть за сталих модулів двох хвиль їхні фази змінюються за координатою. Від різниці фаз залежить модуль суми.",
    sampling: "Окремі коливання надто щільні для епюри. Фазори в заданій координаті розраховуються безпосередньо.",
  },
};

const waves = ["total", "forward", "backward"] as const;
const colors = { total: "blue", forward: "red", backward: "green" } as const;
type Copy = typeof words.ru;
type Inspection = ReturnType<typeof inspectLinePhasors>;
type WaveReadings = Inspection["voltage"];
type Ending = "circuit" | "matched" | "short" | "open";

function Phasors({ values, title, unit, language, copy }: {
  values: WaveReadings; title: string; unit: "V" | "A"; language: Language; copy: Copy;
}) {
  const id = useId().replace(/:/g, "");
  const entries = waves.map(key => ({ key, vector: values[key], polar: phasorPolar(values[key]) }));
  const extent = Math.max(...entries.map(item => item.polar.magnitude)) || 1;
  const origin = { x: 138, y: 99 };
  const tip = (vector: Complex) => ({
    x: origin.x + (vector.re / extent) * 77, y: origin.y - (vector.im / extent) * 77,
  });
  const phase = (angle: number | null) => angle === null ? "—" : formatEngineeringNumber(Math.round(angle * 1000) / 1000, language) + "°";
  return <figure className="steady-phasors">
    <figcaption>{title}</figcaption>
    <svg viewBox="0 0 276 198" role="img" aria-label={title}>
      <defs>{entries.map(({ key }) => <marker key={key} id={id + key} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0 0L8 4L0 8Z" fill={"var(--" + colors[key] + ")"} />
      </marker>)}</defs>
      <circle cx={origin.x} cy={origin.y} r="77" stroke="var(--line)" fill="none" />
      <path d="M38 99H238M138 12V186" stroke="var(--muted)" fill="none" />
      <text x="240" y="103" aria-label={copy.real}>Re</text><text x="143" y="16" aria-label={copy.imaginary}>Im</text>
      {entries.map(({ key, vector, polar }) => {
        const point = tip(vector);
        return <line key={key} data-wave-vector={key} x1={origin.x} y1={origin.y} x2={point.x} y2={point.y}
          stroke={"var(--" + colors[key] + ")"} strokeWidth={key === "total" ? 3.2 : 2.4}
          strokeDasharray={key === "backward" ? "3 3" : undefined}
          markerEnd={polar.magnitude > 0 ? "url(#" + id + key + ")" : undefined}>
          <title>{`${copy[key]} · ${formatEngineeringValue(polar.magnitude, unit, language)} · ${phase(polar.phaseDeg)}`}</title>
        </line>;
      })}
    </svg>
    <table>
      <thead><tr><th scope="col">{copy.waves}</th><th scope="col">{copy.magnitude}</th><th scope="col">{copy.phase}</th></tr></thead>
      <tbody>{entries.map(({ key, polar }) => <tr data-wave-reading={key} data-wave-magnitude={polar.magnitude}
        data-wave-phase={polar.phaseDeg ?? ""} key={key}>
        <th scope="row" style={{ color: "var(--" + colors[key] + ")" }}>{copy[key]}</th>
        <td>{formatEngineeringValue(polar.magnitude, unit, language)}</td><td>{phase(polar.phaseDeg)}</td>
      </tr>)}</tbody>
    </table>
    <p>{copy.shift} Δφ = {phase(values.phaseDifferenceDeg)}</p>
  </figure>;
}

export default function SteadyLineLab({ language }: { language: Language }) {
  const copy = words[language];
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [model, setModel] = useState(() => steadyCircuitMode.readModel(initialDocument));
  const [frequency, setFrequency] = useState("100");
  const [ending, setEnding] = useState<Ending>("circuit");
  const [coordinate, setCoordinate] = useState(0);
  const [error, setError] = useState(false);
  const result = useMemo(() => {
    try {
      const f = Number(frequency);
      const { elements, termination, source } = evaluateSteadyCircuit(model, f, ending);
      const cascade = calculateCascade(elements, f, termination);
      const solved = solvePhasorCascade(cascade, source);
      const phase = cascade.elements.reduce((sum, item) => item.kind === "line"
        ? sum + item.line.gammaPerM.im * item.line.lengthM : sum, 0);
      const count = Math.max(160, Math.ceil(phase * 10));
      const samples = Array.from({ length: Math.min(count, 1400) + 1 }, (_, index) =>
        inspectLinePhasors(solved, index / Math.min(count, 1400) * solved.lengthM));
      return { solved, samples, limited: count > 1400 };
    } catch {
      return null;
    }
  }, [model, frequency, ending]);

  const length = result?.solved.lengthM ?? 0, x = Math.max(0, Math.min(length, coordinate));
  const selected = result ? inspectLinePhasors(result.solved, x) : undefined;
  const plot = (quantity: "voltage" | "current") => {
    if (!result || !selected) return null;
    const symbol = quantity === "voltage" ? "U" : "I", unit = quantity === "voltage" ? "V" : "A";
    const curves: EngineeringPlotData["curves"] = waves.map(key => ({
      label: copy[key], color: colors[key], dash: key !== "total",
      points: result.samples.map(sample => [sample.xM, phasorPolar(sample[quantity][key]).magnitude]),
    }));
    const maximum = Math.max(0, ...curves.flatMap(curve => curve.points.map(point => point[1]))) || 1;
    return <EngineeringPlot language={language} compact label={symbol + "(x)"} plot={{
      xLabel: "x, m", yLabel: "|" + symbol + "|, " + unit, xMax: length, yMin: 0, yMax: maximum, curves,
    }} domains={{ x: [0, length] }} selected={[x, phasorPolar(selected[quantity].total).magnitude]}
      onSelect={point => setCoordinate(point[0])} legendClass="steady-legend" />;
  };

  return <fieldset className="lab-hydration-guard" disabled={!mounted} aria-hidden={!mounted}>
   <div className="steady-line-lab" data-steady-line data-ready={mounted && !!selected} data-coordinate={x}>
    <div className="steady-controls">
      <label>{copy.frequency}<input type="number" min="0.001" step="any" value={frequency} onChange={event => setFrequency(event.target.value)}/></label>
      <label>{copy.ending}<select value={ending} onChange={event => setEnding(event.target.value as Ending)}>
        {(["circuit", "matched", "short", "open"] as const).map(option => <option key={option} value={option}>{copy[option]}</option>)}
      </select></label>
      {selected && <label>{copy.coordinate}, m<input type="number" min="0" max={length} step="any" value={x}
        onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) setCoordinate(event.target.valueAsNumber); }}/></label>}
    </div>
    {!selected && <p role="alert">{copy.invalidCalculation}</p>}
    {selected && <div className="steady-results">
      <div className="steady-curves">{plot("voltage")}{plot("current")}</div>
      <div className="steady-vectors">
        <Phasors values={selected.voltage} title={copy.voltage} unit="V" language={language} copy={copy} />
        <Phasors values={selected.current} title={copy.current} unit="A" language={language} copy={copy} />
      </div>
    </div>}
    {selected && <p className="steady-explanation">{copy.explanation}</p>}
    {result?.limited && <p className="steady-explanation">{copy.sampling}</p>}
    <details className="steady-editor">
      <summary>{copy.editor}</summary>
      {error && <p role="alert">{copy.invalidGraph}</p>}
      <CircuitEditor embedded language={language} initial={initialDocument} mode={steadyCircuitMode} onCalculate={text => {
        try {
          setModel(steadyCircuitMode.readModel(text));
          setError(false);
        } catch (failure) {
          setError(true);
          throw failure;
        }
      }} />
    </details>
   </div>
  </fieldset>;
}
