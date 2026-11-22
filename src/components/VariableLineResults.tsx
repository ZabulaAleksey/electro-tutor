import { useMemo, useState } from "react";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringNumber, formatEngineeringValue } from "../engineering/format";
import type { EngineeringPlotData, PlotPoint } from "../engineering/plot";
import type { Language } from "../types";
import type { VariableLineInput, VariableLineResult } from "../variable-line/contracts";
import { prepareVariableLine } from "../variable-line/profiles";

const copy = {
  ru: {
    title: "Результат опыта", time: "Время t", position: "Координата x", peak: "Пик напряжения на нагрузке",
    maximum: "Максимум |u| на нагрузке за время опыта", noPeak: "Сигнал на нагрузке ниже численного разрешения.",
    delay: "Задержка пика относительно ЭДС", grid: "Ячеек · шагов", parameters: "RLGC в точке наблюдения",
    energy: "Баланс энергии до выбранного момента", stored: "Запас энергии", inputWork: "Работа на входе",
    outputWork: "Работа на нагрузке", lossWork: "Потери", modulationWork: "Работа изменения параметров", residual: "Невязка",
    maxStep: "Максимальная относительная невязка за шаг",
  },
  uk: {
    title: "Результат досліду", time: "Час t", position: "Координата x", peak: "Пік напруги на навантаженні",
    maximum: "Максимум |u| на навантаженні за час досліду", noPeak: "Сигнал на навантаженні нижче чисельної роздільності.",
    delay: "Затримка піка відносно ЕРС", grid: "Комірок · кроків", parameters: "RLGC у точці спостереження",
    energy: "Баланс енергії до вибраного моменту", stored: "Запас енергії", inputWork: "Робота на вході",
    outputWork: "Робота на навантаженні", lossWork: "Втрати", modulationWork: "Робота зміни параметрів", residual: "Нев’язка",
    maxStep: "Максимальна відносна нев’язка за крок",
  },
} as const;

const outputs = [
  ["u-x", "u(x)", "x, m", "u, V", "blue"], ["i-x", "i(x)", "x, m", "i, A", "green"],
  ["u-t", "u(t)", "t, s", "u, V", "blue"], ["i-t", "i(t)", "t, s", "i, A", "green"],
] as const;
const workNames = ["stored", "inputWork", "outputWork", "lossWork", "modulationWork", "residual"] as const;

function locate(axis: Float64Array, position: number) {
  let left = 0;
  let right = axis.length - 1;
  while (right - left > 1) {
    const middle = (left + right) >> 1;
    if (axis[middle] <= position) left = middle;
    else right = middle;
  }
  const fraction = (position - axis[left]) / (axis[right] - axis[left]);
  return { left, right, fraction: Math.min(1, Math.max(0, fraction)) };
}

function observation(result: VariableLineResult, position: number, frame: number) {
  function field(axis: Float64Array, values: Float64Array) {
    const { left, right, fraction } = locate(axis, position);
    const sample = (index: number) => {
      const offset = index * axis.length;
      return values[offset + left] + fraction * (values[offset + right] - values[offset + left]);
    };
    return {
      reading: sample(frame),
      trace: Array.from(result.timeSeconds, (time, index) => [time, sample(index)] as const),
    };
  }
  return { voltage: field(result.voltageMetres, result.voltage), current: field(result.currentMetres, result.current) };
}

function spatialSamples(axis: Float64Array, values: Float64Array, frame: number): PlotPoint[] {
  const offset = frame * axis.length;
  return Array.from(axis, (position, index) => [position, values[offset + index]]);
}

function fieldBounds(values: Float64Array): [number, number] {
  let bottom = 0;
  let top = 0;
  for (const value of values) {
    bottom = Math.min(bottom, value);
    top = Math.max(top, value);
  }
  return bottom === top ? [-1, 1] : [bottom, top];
}

function loadPeak(result: VariableLineResult, input: VariableLineInput) {
  const { timeSeconds: time, voltage, voltageMetres } = result;
  const atLoad = (index: number) => voltage[(index + 1) * voltageMetres.length - 1];
  let frame = 0;
  for (let index = 1; index < time.length; index++) {
    if (Math.abs(atLoad(index)) > Math.abs(atLoad(frame))) frame = index;
  }
  let peakTime = time[frame];
  let peakVoltage = atLoad(frame);
  const interior = frame > 0 && frame < time.length - 1;
  if (interior) {
    // The last interval can be shorter than the ordinary snapshot stride.
    const before = peakTime - time[frame - 1];
    const after = time[frame + 1] - peakTime;
    const slopeIn = (peakVoltage - atLoad(frame - 1)) / before;
    const slopeOut = (atLoad(frame + 1) - peakVoltage) / after;
    const quadratic = (slopeOut - slopeIn) / (before + after);
    const linear = slopeIn + quadratic * before;
    const offset = -linear / (2 * quadratic);
    if (quadratic * peakVoltage < 0 && offset > -before && offset < after) {
      peakTime += offset;
      peakVoltage += offset * (linear + quadratic * offset);
    }
  }
  const pulsePeak = input.pulseWidthTransitTimes * result.transitSeconds / 2;
  const resolved = Math.abs(peakVoltage) > Math.max(Number.EPSILON, Math.abs(input.sourceVolts) * 1e-8);
  return { frame, time: peakTime, voltage: peakVoltage, interior, resolved,
    delay: resolved && interior && peakTime >= pulsePeak ? peakTime - pulsePeak : undefined };
}

export default function VariableLineResults({ language, requestId, input, result, profileLabel, previousLabel, stale }: {
  language: Language; requestId: number; input: VariableLineInput; result: VariableLineResult; profileLabel: string;
  previousLabel?: string; stale: boolean;
}) {
  const t = copy[language];
  const prepared = useMemo(() => prepareVariableLine(input), [input]);
  const peak = useMemo(() => loadPeak(result, input), [result, input]);
  const [frame, setFrame] = useState(peak.frame);
  const [position, setPosition] = useState(input.lengthMetres);
  const time = result.timeSeconds[frame];
  const reading = useMemo(() => observation(result, position, frame), [result, position, frame]);
  const [boundsU, boundsI] = useMemo(() => [fieldBounds(result.voltage), fieldBounds(result.current)], [result]);
  const spatial = useMemo(() => [spatialSamples(result.voltageMetres, result.voltage, frame),
    spatialSamples(result.currentMetres, result.current, frame)], [result, frame]);
  const coefficients = prepared.sample(position / input.lengthMetres, time / result.transitSeconds);
  const energy = result.energy;
  const format = (value: number, unit: string) => formatEngineeringValue(value, unit, language);

  function selectTime(seconds: number) {
    const { left, right, fraction } = locate(result.timeSeconds, seconds);
    setFrame(fraction < .5 ? left : right);
  }

  return <section className="variable-line-results" data-variable-result data-request-id={requestId}
    data-profile-kind={input.profile.kind} data-stale={String(stale)} data-steps={result.steps}
    data-energy-residual={energy.maxStepResidual} data-time-s={time} data-position-m={position}
    data-u={reading.voltage.reading} data-i={reading.current.reading}>
    <div className="variable-line-card">
      <div className="variable-line-result-title">
        <h2>{previousLabel ?? t.title}</h2>
        <span>{profileLabel}</span>
      </div>
      <dl className="variable-line-summary">
        <div data-variable-peak data-peak-time-s={peak.resolved ? peak.time : undefined}
          data-peak-voltage-v={peak.resolved ? peak.voltage : undefined} data-transit-s={peak.delay}>
          <dt>{peak.interior ? t.peak : t.maximum}</dt>
          <dd>{peak.resolved ? `${format(peak.voltage, "V")} · ${format(peak.time, "s")}` : t.noPeak}</dd>
        </div>
        {peak.delay !== undefined && <div><dt>{t.delay}</dt><dd>{format(peak.delay, "s")}</dd></div>}
        <div><dt>{t.grid}</dt><dd>{result.cells} · {result.steps}</dd></div>
      </dl>
      <div className="variable-line-settings variable-line-cursors">
        <label className="variable-line-number"><span>{t.time} = {format(time, "s")}</span>
          <input data-variable-time type="range" min={0} max={result.timeSeconds.length - 1} value={frame}
            aria-valuetext={format(time, "s")} onChange={event => setFrame(event.currentTarget.valueAsNumber)} />
        </label>
        <label className="variable-line-number"><span>{t.position} = {format(position, "m")}</span>
          <input data-variable-position type="range" min={0} max={input.lengthMetres} step={input.lengthMetres / (2 * result.cells)}
            value={position} aria-valuetext={format(position, "m")} onChange={event => setPosition(event.currentTarget.valueAsNumber)} />
        </label>
      </div>
      <div className="variable-line-readings">
        <strong>u = {format(reading.voltage.reading, "V")}</strong>
        <strong>i = {format(reading.current.reading, "A")}</strong>
      </div>
    </div>
    <div className="variable-line-plots">
      {outputs.map(([id, title, xLabel, yLabel, color], index) => {
        const byTime = index >= 2;
        const voltage = index % 2 === 0;
        const { reading: magnitude, trace } = voltage ? reading.voltage : reading.current;
        const [yMin, yMax] = voltage ? boundsU : boundsI;
        const xMax = byTime ? result.timeSeconds.at(-1)! : input.lengthMetres;
        const plot: EngineeringPlotData = { xLabel, yLabel, xMax, yMin, yMax,
          curves: [{ label: title, color, points: byTime ? trace : spatial[index] }] };
        return <section className="variable-line-card variable-line-plot" key={id} data-variable-plot={id} aria-label={title}>
          <h3>{title}</h3>
          <EngineeringPlot plot={plot} label={title} language={language} showLegend={false}
            selected={[byTime ? time : position, magnitude]} onSelect={point => (byTime ? selectTime : setPosition)(point[0])} />
        </section>;
      })}
    </div>
    <section className="variable-line-card" data-variable-energy data-stored-j={energy.stored[frame]}
      data-input-work-j={energy.inputWork[frame]} data-output-work-j={energy.outputWork[frame]} data-loss-work-j={energy.lossWork[frame]}
      data-modulation-work-j={energy.modulationWork[frame]} data-residual-j={energy.residual[frame]}
      data-max-step-residual={energy.maxStepResidual}>
      <h3>{t.energy}</h3>
      <dl className="variable-line-summary">
        {workNames.map(key => <div key={key}><dt>{t[key]}</dt><dd>{format(energy[key][frame], "J")}</dd></div>)}
        <div><dt>{t.maxStep}</dt><dd>{formatEngineeringNumber(energy.maxStepResidual, language)}</dd></div>
      </dl>
    </section>
    <section className="variable-line-card" data-variable-local-coefficients>
      <h3>{t.parameters}</h3>
      <dl className="variable-line-summary">
        {([
          ["R′", coefficients.r * input.characteristicOhms / input.lengthMetres, "Ом/м"],
          ["L′", coefficients.l * input.characteristicOhms / input.velocityMetresPerSecond, "Гн/м"],
          ["G′", coefficients.g / (input.characteristicOhms * input.lengthMetres), "См/м"],
          ["C′", coefficients.c / (input.characteristicOhms * input.velocityMetresPerSecond), "Ф/м"],
        ] as const).map(([name, value, unit]) => <div key={name} data-coefficient={name} data-value={value}>
          <dt>{name}</dt><dd>{format(value, unit)}</dd>
        </div>)}
      </dl>
    </section>
  </section>;
}
