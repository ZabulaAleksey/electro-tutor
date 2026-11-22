import { useEffect, useMemo, useRef, useState } from "react";
import type { CircuitComponent } from "../circuit/topology";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { formatEngineeringValue } from "../engineering/format";
import type { Language } from "../types";
import {
  newVariableLineCircuit, removeVariableLineResistor, setVariableLineLength, setVariableLineResistance,
  setVariableLineSource, variableLineBoundaries, variableLineSeriesWires, variableLineSourceVolts,
} from "../variable-line/circuit";
import { VariableLineError, type CoefficientProfile, type VariableLineErrorCode, type VariableLineInput,
  type VariableLineProfile, type VariableLineReply, type VariableLineRequest, type VariableLineResult } from "../variable-line/contracts";
import { defaultCoaxProfile, defaultIndependentProfile, defaultVariableLineInput } from "../variable-line/profiles";
import LineExperimentEditor from "./LineExperimentEditor";
import VariableLineResults from "./VariableLineResults";
import "./VariableLineLab.css";

const copy = {
  ru: {
    sourceOhms: "Сопротивление источника", loadOhms: "Сопротивление нагрузки", resistance: "Сопротивление R, Ом",
    source: "Амплитуда ЭДС, В", length: "Длина линии ℓ, км", velocity: "Базовая скорость v₀, тыс. км/с", impedance: "Базовый импеданс Z₀, Ом",
    parameters: "Параметры опыта", preset: "Профиль линии", pulse: "Длительность импульса, T₀", duration: "Время наблюдения, T₀", cells: "Число ячеек",
    transit: "Базовое время пробега T₀", base: "Основа", spatial: "Амплитуда по x", temporal: "Амплитуда по t",
    conductor: "Потери в проводниках", dielectric: "Потери в диэлектрике",
    coefficientHelp: "Основы заданы как R′ℓ/Z₀, L′v₀/Z₀, G′ℓZ₀ и C′v₀Z₀. Каждая основа умножается на 1 + aₓ sin(2πx/ℓ) + aₜ sin(2πt/T₀).",
    coaxHelp: "Профиль задаёт ln(b/a) относительно среднего значения. При его изменении L′ меняется прямо, а C′ и G′ обратно.",
    presets: { lossless: "Без потерь", heaviside: "Потери без искажения (Хевисайд)", dispersive: "Независимые потери с искажением",
      independent: "Переменные R′, L′, G′, C′", coax: "Переменная геометрия коаксиала" },
    run: "Рассчитать", cancel: "Отменить расчёт", fieldError: "Значение не принято. Сохранено прежнее значение.",
    states: { idle: "", running: "Расчёт эпюр", cancelling: "Отмена расчёта…", cancelled: "Расчёт отменён.",
      complete: "Расчёт завершён.", stale: "Параметры изменены. Выполните новый расчёт.", error: "" },
    previous: "Последний успешный расчёт", errors: {
      "invalid-input": "Проверьте длину, скорость, импеданс, длительность импульса и время наблюдения.",
      "profile-range": "Заданный профиль даёт параметры линии или скорость волны за допустимыми пределами.",
      "boundary-range": "Сопротивление каждой границы должно быть от 0,25 до 4 Z₀.",
      "grid-resolution": "Сетка слишком редкая для импульса или профиля. Увеличьте число ячеек или растяните импульс.",
      "step-budget": "Для этого опыта требуется больше 16 384 шагов. Сократите время наблюдения или уточните параметры.",
      "result-budget": "Размер сохраняемых полей превышает 4 МиБ.",
      "numerical-failure": "Численный расчёт прерван. Проверьте коэффициенты и сетку.",
      "energy-balance": "Численная невязка энергии превысила допуск.",
      "worker-unavailable": "Не удалось запустить вычислительный модуль браузера.",
    },
  },
  uk: {
    sourceOhms: "Опір джерела", loadOhms: "Опір навантаження", resistance: "Опір R, Ом",
    source: "Амплітуда ЕРС, В", length: "Довжина лінії ℓ, км", velocity: "Базова швидкість v₀, тис. км/с", impedance: "Базовий імпеданс Z₀, Ом",
    parameters: "Параметри досліду", preset: "Профіль лінії", pulse: "Тривалість імпульсу, T₀", duration: "Час спостереження, T₀", cells: "Кількість комірок",
    transit: "Базовий час пробігу T₀", base: "Основа", spatial: "Амплітуда за x", temporal: "Амплітуда за t",
    conductor: "Втрати в провідниках", dielectric: "Втрати в діелектрику",
    coefficientHelp: "Основи задано як R′ℓ/Z₀, L′v₀/Z₀, G′ℓZ₀ та C′v₀Z₀. Кожна основа множиться на 1 + aₓ sin(2πx/ℓ) + aₜ sin(2πt/T₀).",
    coaxHelp: "Профіль задає ln(b/a) відносно середнього значення. Коли воно змінюється, L′ змінюється прямо, а C′ і G′ обернено.",
    presets: { lossless: "Без втрат", heaviside: "Втрати без спотворення (Гевісайд)", dispersive: "Незалежні втрати зі спотворенням",
      independent: "Змінні R′, L′, G′, C′", coax: "Змінна геометрія коаксіалу" },
    run: "Розрахувати", cancel: "Скасувати розрахунок", fieldError: "Значення не прийнято. Збережено попереднє значення.",
    states: { idle: "", running: "Розрахунок епюр", cancelling: "Скасування розрахунку…", cancelled: "Розрахунок скасовано.",
      complete: "Розрахунок завершено.", stale: "Параметри змінено. Виконайте новий розрахунок.", error: "" },
    previous: "Останній успішний розрахунок", errors: {
      "invalid-input": "Перевірте довжину, швидкість, імпеданс, тривалість імпульсу та час спостереження.",
      "profile-range": "Заданий профіль дає параметри лінії або швидкість хвилі поза допустимими межами.",
      "boundary-range": "Опір кожної границі має бути від 0,25 до 4 Z₀.",
      "grid-resolution": "Сітка надто рідка для імпульсу або профілю. Збільште кількість комірок або розтягніть імпульс.",
      "step-budget": "Цей дослід потребує понад 16 384 кроки. Скоротіть час спостереження або уточніть параметри.",
      "result-budget": "Розмір збережених полів перевищує 4 МіБ.",
      "numerical-failure": "Чисельний розрахунок перервано. Перевірте коефіцієнти й сітку.",
      "energy-balance": "Чисельна нев'язка енергії перевищила допуск.",
      "worker-unavailable": "Не вдалося запустити обчислювальний модуль браузера.",
    },
  },
} as const;

const quantities = ["r", "l", "g", "c"] as const;
const coefficients = ["base", "spatial", "temporal"] as const;
const kindOptions = ["lossless", "heaviside", "dispersive", "independent", "coax"] as const;
const fixedParts = new Set(["E1", "R1", "TL1", "R2"]);

type Phase = keyof typeof copy.ru.states;
type State = { phase: Phase; progress?: number; error?: VariableLineErrorCode };
type Active = { id: number; revision: number; input: VariableLineInput; cancelled: boolean };
type Completed = { id: number; revision: number; input: VariableLineInput; result: VariableLineResult };
type Settings = Pick<VariableLineInput, "velocityMetresPerSecond" | "characteristicOhms" | "pulseWidthTransitTimes" | "durationTransitTimes" | "cells">;

function NumberField({ name, value, label, min, max, integral, onValue }: {
  name: string; label: string; value: number; min: number; max: number; integral?: boolean; onValue: (value: number) => void;
}) {
  return <label className="variable-line-number">
    <span>{label}</span>
    <input data-variable-field={name} data-variable-cells={name === "cells" || undefined}
      data-variable-duration={name === "duration" || undefined} type="number"
      inputMode={integral ? "numeric" : "decimal"} value={Number.isFinite(value) ? value : ""}
      min={min} max={max} step={integral ? 1 : "any"}
      aria-invalid={(!Number.isFinite(value) || value < min || value > max || integral && !Number.isInteger(value)) || undefined}
      onChange={event => onValue(event.currentTarget.valueAsNumber)} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      }} />
  </label>;
}

function CircuitField({ name, value, label, min, max, invalid, onCommit }: {
  name: string; label: string; value: number; min: number; max: number; invalid: string; onCommit: (value: number) => boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const [failed, setFailed] = useState(false);
  return <label className="variable-line-number">
    <span>{label}</span>
    <input data-variable-field={name} type="number" inputMode="decimal" min={min} max={max} step="any"
      value={draft ?? String(value)} aria-invalid={failed || undefined}
      onChange={event => { setDraft(event.currentTarget.value); setFailed(false); }}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { setDraft(undefined); setFailed(false); }
      }}
      onBlur={event => {
        if (draft === undefined) return;
        const candidate = event.currentTarget.valueAsNumber;
        if (!Number.isFinite(candidate) || candidate < min || candidate > max || !onCommit(candidate)) {
          setDraft(undefined);
          setFailed(true);
        } else {
          setDraft(undefined);
          setFailed(false);
        }
      }} />
    {failed && <small role="alert">{invalid}</small>}
  </label>;
}

export default function VariableLineLab({ language }: { language: Language }) {
  const t = copy[language];
  const [ready, setReady] = useState(false);
  const [circuit, setCircuit] = useState(newVariableLineCircuit);
  const [settings, setSettings] = useState<Settings>(defaultVariableLineInput);
  const [kind, setKind] = useState<VariableLineProfile["kind"]>("lossless");
  const [independent, setIndependent] = useState(defaultIndependentProfile);
  const [coax, setCoax] = useState(defaultCoaxProfile);
  const [status, setStatus] = useState<State>({ phase: "idle" });
  const [completed, setCompleted] = useState<Completed>();
  const instance = useRef<Worker | undefined>(undefined);
  const active = useRef<Active | undefined>(undefined);
  const serial = useRef(0);
  const revision = useRef(0);
  const [draftRevision, setDraftRevision] = useState(0);
  const hasResult = useRef(false);
  const runControl = useRef<HTMLButtonElement>(null);
  const restoreRunFocus = useRef(false);
  const boundaries = useMemo(() => variableLineBoundaries(circuit), [circuit]);
  const seriesWireIds = useMemo(() => variableLineSeriesWires(circuit), [circuit]);
  const length = Number(circuit.topology.components.find(part => part.id === "TL1")?.parameters.lengthM);
  const transit = length / settings.velocityMetresPerSecond;
  const busy = status.phase === "running" || status.phase === "cancelling";

  useEffect(() => {
    setReady(true);
    return () => {
      active.current = undefined;
      instance.current?.terminate();
      instance.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!busy && restoreRunFocus.current) {
      restoreRunFocus.current = false;
      const control = runControl.current;
      if (control && control.ownerDocument.activeElement === control.ownerDocument.body) control.focus({ preventScroll: true });
    }
  }, [busy]);

  function post(worker: Worker, request: VariableLineRequest) {
    worker.postMessage(request);
  }

  function getWorker(): Worker {
    if (instance.current) return instance.current;
    const worker = new Worker(new URL("../variable-line/variable-line.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<VariableLineReply>) => {
      const pending = active.current;
      if (!pending || worker !== instance.current || data.requestId !== pending.id || pending.revision !== revision.current) return;
      if (data.type === "progress") {
        if (!pending.cancelled) setStatus({ phase: "running", progress: data.completed / data.total });
        return;
      }
      active.current = undefined;
      if (pending.cancelled || data.type === "cancelled") setStatus({ phase: "cancelled" });
      else if (data.type === "error") setStatus({ phase: "error", error: data.code });
      else {
        hasResult.current = true;
        setCompleted({ id: pending.id, revision: pending.revision, input: pending.input, result: data.result });
        setStatus({ phase: "complete" });
      }
    };
    function onFailure(event: Event) {
      event.preventDefault();
      if (worker !== instance.current) return;
      const pending = active.current;
      active.current = undefined;
      instance.current = undefined;
      worker.terminate();
      if (pending) setStatus(pending.cancelled ? { phase: "cancelled" } : { phase: "error", error: "worker-unavailable" });
    }
    worker.onerror = onFailure;
    worker.onmessageerror = onFailure;
    instance.current = worker;
    return worker;
  }

  function invalidate() {
    const pending = active.current;
    active.current = undefined;
    setDraftRevision(++revision.current);
    if (pending && !pending.cancelled && instance.current) post(instance.current, { type: "cancel", requestId: pending.id });
    setStatus({ phase: hasResult.current ? "stale" : "idle" });
  }

  function changeCircuit(next: TopologyLabDocument) {
    if (next !== circuit) {
      invalidate();
      setCircuit(next);
    }
  }

  function changeSetting(key: keyof Settings, value: number) {
    if (!Object.is(settings[key], value)) {
      invalidate();
      setSettings(previous => ({ ...previous, [key]: value }));
    }
  }

  function start() {
    if (active.current) return;
    try {
      const input: VariableLineInput = {
        ...settings, ...boundaries, lengthMetres: length, sourceVolts: variableLineSourceVolts(circuit),
        profile: kind === "independent" ? independent : kind === "coax" ? coax : { kind },
      };
      const worker = getWorker();
      const id = ++serial.current;
      active.current = { id, input, revision: revision.current, cancelled: false };
      setStatus({ phase: "running", progress: 0 });
      post(worker, { type: "run", requestId: id, input });
    } catch (error) {
      active.current = undefined;
      setStatus({ phase: "error", error: error instanceof VariableLineError ? error.code : "worker-unavailable" });
    }
  }

  function cancel() {
    const pending = active.current;
    if (!pending || pending.cancelled || !instance.current) return;
    pending.cancelled = true;
    restoreRunFocus.current = true;
    setStatus(previous => ({ ...previous, phase: "cancelling" }));
    post(instance.current, { type: "cancel", requestId: pending.id });
  }

  function inspect(part: CircuitComponent) {
    const id = part.id;
    function commit(update: () => TopologyLabDocument) {
      try { changeCircuit(update()); return true; }
      catch { return false; }
    }
    return <fieldset key={id} className="variable-line-inspector">
      <legend>{id}</legend>
      {part.kind === "r" && <CircuitField name="resistance" label={t.resistance} value={Number(part.parameters.ohm)}
        min={0.000001} max={40_000} invalid={t.fieldError}
        onCommit={next => commit(() => setVariableLineResistance(circuit, id, next))} />}
      {part.kind === "voltage" && <CircuitField name="source-volts" label={t.source} value={variableLineSourceVolts(circuit)}
        min={-1_000} max={1_000} invalid={t.fieldError} onCommit={next => commit(() => setVariableLineSource(circuit, next))} />}
      {part.kind === "line" && <>
        <CircuitField name="length-km" label={t.length} value={length / 1_000} min={0.001} max={10_000}
          invalid={t.fieldError} onCommit={next => commit(() => setVariableLineLength(circuit, next * 1_000))} />
        <NumberField name="velocity" label={t.velocity} value={settings.velocityMetresPerSecond / 1e6} min={1} max={299.792458}
          onValue={next => changeSetting("velocityMetresPerSecond", next * 1e6)} />
        <NumberField name="impedance" label={t.impedance} value={settings.characteristicOhms} min={1} max={10_000}
          onValue={next => changeSetting("characteristicOhms", next)} />
      </>}
    </fieldset>;
  }

  const currentResult = completed?.revision === draftRevision;
  return <section className="variable-line-lab" data-variable-line-lab data-ready={String(ready)}>
    <LineExperimentEditor language={language} document={circuit} onChange={changeCircuit} variant="variable"
      seriesWireIds={seriesWireIds} canRemove={id => !fixedParts.has(id)} renderInspector={inspect}
      onRemove={id => changeCircuit(removeVariableLineResistor(circuit, id))} />
    <dl className="variable-line-summary">
      <div data-variable-source-ohms data-ohms={boundaries.sourceOhms}><dt>{t.sourceOhms}</dt><dd>{formatEngineeringValue(boundaries.sourceOhms, "Ω", language)}</dd></div>
      <div data-variable-load-ohms data-ohms={boundaries.loadOhms}><dt>{t.loadOhms}</dt><dd>{formatEngineeringValue(boundaries.loadOhms, "Ω", language)}</dd></div>
      <div><dt>{t.transit}</dt><dd>{formatEngineeringValue(transit, "s", language)}</dd></div>
    </dl>
    <form className="variable-line-card variable-line-setup" noValidate onSubmit={event => { event.preventDefault(); start(); }}>
      <h2>{t.parameters}</h2>
      <label className="variable-line-number">
        <span>{t.preset}</span>
        <select data-variable-profile value={kind} onChange={event => {
          invalidate();
          setKind(event.currentTarget.value as typeof kind);
        }}>
          {kindOptions.map(value => <option key={value} value={value}>{t.presets[value]}</option>)}
        </select>
      </label>
      {kind === "independent" && <div className="variable-line-profile-fields">
        <p>{t.coefficientHelp}</p>
        {quantities.map((key) => <fieldset key={key} className="variable-line-coefficient">
          <legend>{key.toUpperCase()}′</legend>
          {coefficients.map(parameter => <NumberField key={parameter} name={`${key}-${parameter}`} label={t[parameter]}
            value={independent[key][parameter]} min={parameter === "base" ? (key === "l" || key === "c" ? .5 : 0) : -1}
            max={parameter === "base" ? 2 : 1} onValue={value => {
              invalidate();
              setIndependent(previous => ({ ...previous, [key]: { ...previous[key], [parameter]: value } satisfies CoefficientProfile }));
            }} />)}
        </fieldset>)}
      </div>}
      {kind === "coax" && <div className="variable-line-profile-fields">
        <p>{t.coaxHelp}</p>
        <div className="variable-line-settings">
          {([ ["spatial", t.spatial, -1, 1], ["temporal", t.temporal, -1, 1],
            ["conductorLoss", t.conductor, 0, 2], ["dielectricLoss", t.dielectric, 0, 2] ] as const).map(([key, label, min, max]) =>
            <NumberField key={key} name={`coax-${key}`} label={label} min={min} max={max} value={coax[key]} onValue={value => {
              invalidate();
              setCoax(previous => ({ ...previous, [key]: value }));
            }} />)}
        </div>
      </div>}
      <div className="variable-line-settings">
        <NumberField name="pulse-width" label={t.pulse} min={0.125} max={4} value={settings.pulseWidthTransitTimes}
          onValue={next => changeSetting("pulseWidthTransitTimes", next)} />
        <NumberField name="duration" label={t.duration} min={0.125} max={8} value={settings.durationTransitTimes}
          onValue={next => changeSetting("durationTransitTimes", next)} />
        <NumberField name="cells" label={t.cells} min={16} max={512} integral value={settings.cells}
          onValue={next => changeSetting("cells", next)} />
      </div>
      <div className="variable-line-actions">
        <button ref={runControl} type="submit" data-variable-run disabled={!ready || busy}>{t.run}</button>
        {busy && <button type="button" data-variable-cancel onClick={cancel} disabled={status.phase === "cancelling"}>{t.cancel}</button>}
      </div>
      <div data-variable-status={status.phase} role="status" className="variable-line-status">
        {busy && <progress data-variable-progress aria-label={t.states.running} max={1} value={status.progress ?? 0} />}
        {t.states[status.phase]}
      </div>
      {status.error && <p data-variable-error={status.error} className="variable-line-error" role="alert">{t.errors[status.error]}</p>}
    </form>
    {completed && <VariableLineResults key={completed.id} language={language} requestId={completed.id} input={completed.input}
      result={completed.result} previousLabel={currentResult && status.phase === "complete" ? undefined : t.previous}
      profileLabel={t.presets[completed.input.profile.kind]} stale={!currentResult} />}
  </section>;
}
