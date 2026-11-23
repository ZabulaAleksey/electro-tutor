import { useEffect, useMemo, useState } from "react";
import type { CircuitComponent } from "../circuit/topology";
import { appendSteadyLine, newSteadyExperiment, removeSteadyPart, updateSteadyCircuit, updateSteadyPart, type SteadyExperiment } from "../steady-line/experiment-document";
import { solveSteadyExperiment, type DistributedParameters } from "../steady-line/experiment-solver";
import type { Language } from "../types";
import LineExperimentEditor from "./LineExperimentEditor";
import SteadyExperimentResults from "./SteadyExperimentResults";
import "./SteadyExperimentLab.css";

const copy = {
  ru: {
    frequency: "Частота, Гц", inspector: "Параметры", undo: "Отменить", redo: "Повторить", rms: "Действующие значения (RMS)",
    length: "Длина ℓ, м", resistance: "R, Ом", inductance: "L, Гн", capacitance: "C, Ф",
    emf: "ЭДС E, В RMS", current: "Ток J, А RMS", phase: "Начальная фаза, °",
    r: "R′, Ом/м", l: "L′, Гн/м", g: "G′, См/м", c: "C′, Ф/м", invalid: "Введите значение в пределах допустимого диапазона.",
    errors: {
      "steady-invalid-reference": "Общий провод схемы не определён.",
      "steady-missing-line": "Добавьте секцию длинной линии.",
      "steady-invalid-frequency": "Задайте положительную частоту.",
      "steady-invalid-line": "Проверьте длину и распределённые параметры участка.",
      "steady-singular": "У схемы нет единственного конечного решения. Проверьте разрыв, идеальные источники и резонанс.",
      "steady-limit": "Достигнут предел расчёта: 100 элементов или 12 секций.",
      "steady-numeric-range": "Расчёт вышел за допустимый численный диапазон.",
    },
    fallback: "Схему не удалось рассчитать. Проверьте элементы и соединения.",
  },
  uk: {
    frequency: "Частота, Гц", inspector: "Параметри", undo: "Скасувати", redo: "Повторити", rms: "Діючі значення (RMS)",
    length: "Довжина ℓ, м", resistance: "R, Ом", inductance: "L, Гн", capacitance: "C, Ф",
    emf: "ЕРС E, В RMS", current: "Струм J, А RMS", phase: "Початкова фаза, °",
    r: "R′, Ом/м", l: "L′, Гн/м", g: "G′, См/м", c: "C′, Ф/м", invalid: "Введіть значення в межах допустимого діапазону.",
    errors: {
      "steady-invalid-reference": "Спільний провід схеми не визначено.",
      "steady-missing-line": "Додайте секцію довгої лінії.",
      "steady-invalid-frequency": "Задайте додатну частоту.",
      "steady-invalid-line": "Перевірте довжину та розподілені параметри ділянки.",
      "steady-singular": "Схема не має єдиного скінченного розв’язку. Перевірте розрив, ідеальні джерела та резонанс.",
      "steady-limit": "Досягнуто межі розрахунку: 100 елементів або 12 секцій.",
      "steady-numeric-range": "Розрахунок вийшов за межі допустимого числового діапазону.",
    },
    fallback: "Схему не вдалося розрахувати. Перевірте елементи й з’єднання.",
  },
} as const;

type NumberFieldProps = {
  field: string; label: string; value: number; min: number; max: number; invalid: string; disabled?: boolean; onCommit: (value: number) => void;
};

function NumberField({ field, label, value, min, max, invalid, disabled, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState(false);
  return <label className="steady-experiment-number">
    <span>{label}</span>
    <input disabled={disabled} data-steady-field={field} type="number" value={draft ?? String(value)} min={min} max={max} step="any"
      aria-invalid={error || undefined}
      onChange={event => { setDraft(event.currentTarget.value); setError(false); }}
      onBlur={event => {
        if (draft === undefined) return;
        const candidate = event.currentTarget.valueAsNumber;
        if (Number.isFinite(candidate) && candidate >= min && candidate <= max) {
          onCommit(candidate);
          setDraft(undefined);
        } else {
          setError(true);
        }
      }}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { setDraft(undefined); setError(false); }
      }} />
    {error && <small role="alert">{invalid}</small>}
  </label>;
}

type Editing = { value: SteadyExperiment; past: SteadyExperiment[]; future: SteadyExperiment[] };

export default function SteadyExperimentLab({ language }: { language: Language }) {
  const t = copy[language];
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [{ value, past, future }, setEditing] = useState<Editing>(() => ({ value: newSteadyExperiment(), past: [], future: [] }));
  const [observation, observe] = useState({ id: "TL1", xM: 0 });
  const [editError, setEditError] = useState("");
  const { circuit, settings } = value;
  const projected = useMemo(() => {
    try { return { solution: solveSteadyExperiment(circuit.topology, settings) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [circuit.topology, settings]);
  const { solution } = projected;
  const section = solution?.sections.find(({ id }) => id === observation.id) ?? solution?.sections[0];
  const selectedX = section?.id === observation.id ? Math.min(observation.xM, section.lengthM) : 0;

  function update(change: (current: SteadyExperiment) => SteadyExperiment) {
    setEditing(previous => {
      const next = change(previous.value);
      return next === previous.value ? previous : {
        value: next, past: [...previous.past, previous.value].slice(-64), future: [],
      };
    });
    setEditError("");
  }

  function changeHistory(direction: "undo" | "redo") {
    setEditing(previous => {
      if (direction === "undo") {
        const last = previous.past.at(-1);
        return last ? { value: last, past: previous.past.slice(0, -1), future: [previous.value, ...previous.future] } : previous;
      }
      const next = previous.future[0];
      return next ? { value: next, past: [...previous.past, previous.value], future: previous.future.slice(1) } : previous;
    });
    setEditError("");
  }

  function diagnostic(code: string) {
    return t.errors[code as keyof typeof t.errors] || t.fallback;
  }

  function inspect(part: CircuitComponent) {
    const id = part.id;
    const field = (key: string, label: string, current: number, min: number, max: number, commit: (next: number) => void) =>
      <NumberField key={id + key} field={key} label={label} value={current} min={min} max={max} invalid={t.invalid} onCommit={commit} />;
    const parameter = (key: string, label: string, min: number, max: number) =>
      field(key, label, Number(part.parameters[key]), min, max, next => update(previous => updateSteadyPart(previous, id, key, next)));
    if (part.kind === "line") {
      const line = settings.lineParameters[id];
      const distributed = (key: keyof DistributedParameters, label: string, min: number, max: number) =>
        field(key, label, line[key], min, max, next => update(previous => {
          const prior = previous.settings.lineParameters[id];
          return prior[key] === next ? previous : { ...previous, settings: {
            ...previous.settings, lineParameters: { ...previous.settings.lineParameters, [id]: { ...prior, [key]: next } },
          } };
        }));
      return <fieldset className="steady-experiment-fields">
        <legend>{t.inspector} · {id}</legend>
        {parameter("lengthM", t.length, 1e-6, 1e9)}
        {distributed("rOhmM", t.r, 0, 1e7)}
        {distributed("lHenryM", t.l, 1e-15, 100)}
        {distributed("gSiemensM", t.g, 0, 1e7)}
        {distributed("cFaradM", t.c, 1e-15, 100)}
      </fieldset>;
    }
    return <fieldset className="steady-experiment-fields">
      <legend>{t.inspector} · {id}</legend>
      {part.kind === "r" && parameter("ohm", t.resistance, 0, 1e12)}
      {part.kind === "l" && parameter("henry", t.inductance, 1e-12, 1e8)}
      {part.kind === "c" && parameter("farad", t.capacitance, 1e-15, 100)}
      {part.kind === "voltage" && parameter("voltageV", t.emf, 0, 1e9)}
      {part.kind === "current" && parameter("currentA", t.current, 0, 1e9)}
      {(part.kind === "voltage" || part.kind === "current") &&
        field("phaseDeg", t.phase, settings.sourcePhases[id] ?? 0, -360, 360, next => update(previous =>
          previous.settings.sourcePhases[id] === next ? previous : { ...previous, settings: {
            ...previous.settings, sourcePhases: { ...previous.settings.sourcePhases, [id]: next },
          } }))}
    </fieldset>;
  }

  return <div className="steady-experiment-lab" inert={!hydrated} data-steady-experiment data-ready={String(hydrated && !!section)} data-frequency-hz={settings.frequencyHz}>
    <div className="steady-experiment-settings">
      <NumberField disabled={!hydrated} field="frequencyHz" label={t.frequency} value={settings.frequencyHz}
        min={1e-3} max={1e9} invalid={t.invalid} onCommit={next => update(previous =>
          previous.settings.frequencyHz === next ? previous : { ...previous, settings: { ...previous.settings, frequencyHz: next } })} />
      <span>{t.rms}</span>
      <div className="steady-experiment-history">
        <button type="button" data-steady-undo onClick={() => changeHistory("undo")} disabled={!past.length}>{t.undo}</button>
        <button type="button" data-steady-redo onClick={() => changeHistory("redo")} disabled={!future.length}>{t.redo}</button>
      </div>
    </div>
    <LineExperimentEditor language={language} document={circuit} variant="steady"
      referenceEndpoint={settings.referenceEndpoint} renderInspector={inspect}
      onChange={next => update(previous => updateSteadyCircuit(previous, next))}
      onAppendSection={endpoint => {
        const lines = circuit.topology.components.filter(({ kind }) => kind === "line");
        if (lines.length >= 12 || circuit.topology.components.length >= 100) { setEditError(diagnostic("steady-limit")); return; }
        if (endpoint) update(previous => appendSteadyLine(previous, endpoint));
      }}
      onRemove={(id, source) => update(previous => removeSteadyPart({ ...previous, circuit: source }, id))}
      onOpenSection={id => observe(previous => previous.id === id ? previous : { id, xM: 0 })} />
    {editError && <p role="alert" className="steady-experiment-error">{editError}</p>}
    {projected.error && <p role="alert" className="steady-experiment-error" data-steady-solver-error={projected.error}>{diagnostic(projected.error)}</p>}
    {solution && section && <SteadyExperimentResults language={language} solution={solution} sectionId={section.id}
      xM={selectedX} onPositionChange={xM => observe({ id: section.id, xM })} />}
  </div>;
}
