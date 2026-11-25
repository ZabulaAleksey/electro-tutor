import { useEffect, useMemo, useRef, useState } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { Complex } from "../models/circular-diagram";
import {
  areas, newSequenceDocument, phases, z, type Area, type Neutral, type Phase, type SequenceDocument,
  type SequenceEdit, type SectionReading, type Triple,
} from "../sequence/contract";
import { nextSequenceEditId, readSequenceDocument, sequenceArchiveBytes, sequenceEditLimit, validateSequenceDocument } from "../sequence/document";
import { solveSequence } from "../sequence/solve";
import type { Language } from "../types";
import { SequenceCircuit, SequenceResults } from "./SequenceDiagrams";
import "./SequenceLab.css";

const copy = {
  ru: {
    area: { generator: "Генератор", line: "Линия", load: "Нагрузка" },
    edit: { series: "Последовательный импеданс", open: "Обрыв проводника", shunt: "Поперечное соединение" },
    parameters: "Параметры участков", neutral: "Нейтраль", source: "ЭДС прямой последовательности, В", frequency: "Частота, Гц",
    grounded: "Заземлена", isolated: "Изолирована", ground: "Земля", change: "Редактировать", remove: "Удалить",
    editHeading: "Изменение схемы", where: "Участок", point: "Положение от начала участка, 0–1",
    what: "Операция", phase: "Фазы", target: "Соединить с", add: "Добавить", apply: "Применить", cancel: "Отмена",
    shared: "При замыкании нескольких фаз на землю они соединяются через один общий импеданс Zf.",
    noEdits: "В схеме нет дополнительных элементов или повреждений.",
    read: "Сечение для измерения", import: "Открыть JSON", download: "Сохранить JSON", archive: "Архив и история",
    undo: "Отменить", redo: "Повторить", reset: "Начальная схема", limit: "Можно добавить до 16 изменений.",
    invalid: "Проверьте параметры, выбранные фазы и место соединения.",
    importError: "Архив не открыт. Проверьте формат и значения.",
    reason: {
      inconsistent: "Соединения задают противоречивые условия. Проверьте идеальные источники, КЗ и обрывы.",
      indeterminate: "Токи или напряжения в этой схеме не определены однозначно. Проверьте идеальные параллельные соединения.",
      range: "Численный расчёт для выбранных значений недоступен. Проверьте импедансы и расстояния между изменениями.",
    },
  },
  uk: {
    area: { generator: "Генератор", line: "Лінія", load: "Навантаження" },
    edit: { series: "Послідовний імпеданс", open: "Обрив провідника", shunt: "Поперечне з’єднання" },
    parameters: "Параметри ділянок", neutral: "Нейтраль", source: "ЕРС прямої послідовності, В", frequency: "Частота, Гц",
    grounded: "Заземлена", isolated: "Ізольована", ground: "Земля", change: "Редагувати", remove: "Видалити",
    editHeading: "Зміна схеми", where: "Ділянка", point: "Положення від початку ділянки, 0–1",
    what: "Операція", phase: "Фази", target: "З’єднати з", add: "Додати", apply: "Застосувати", cancel: "Скасувати",
    shared: "У разі замикання кількох фаз на землю вони з’єднуються через один спільний імпеданс Zf.",
    noEdits: "У схемі немає додаткових елементів або пошкоджень.",
    read: "Переріз для вимірювання", import: "Відкрити JSON", download: "Зберегти JSON", archive: "Архів та історія",
    undo: "Скасувати", redo: "Повторити", reset: "Початкова схема", limit: "Можна додати до 16 змін.",
    invalid: "Перевірте параметри, вибрані фази й місце з’єднання.",
    importError: "Архів не відкрито. Перевірте формат і значення.",
    reason: {
      inconsistent: "З’єднання задають суперечливі умови. Перевірте ідеальні джерела, КЗ та обриви.",
      indeterminate: "Струми або напруги в цій схемі визначаються неоднозначно. Перевірте ідеальні паралельні з’єднання.",
      range: "Числовий розрахунок для вибраних значень недоступний. Перевірте імпеданси та відстані між змінами.",
    },
  },
} as const;

type NeutralSide = "generator" | "load";
type Draft = {
  area: Area;
  at: string;
  kind: SequenceEdit["kind"];
  phases: readonly Phase[];
  target: Phase | "ground";
  resistance: string;
  reactance: string;
};
const emptyDraft: Draft = { area: "line", at: "0.5", kind: "series", phases: ["A"], target: "ground", resistance: "0", reactance: "0" };
const neutralKey = (side: NeutralSide) => side === "generator" ? "generatorNeutral" : "loadNeutral";

function NumberField({ label, value, minimum, maximum, onUpdate }: {
  label: string; value: number; minimum: number; maximum: number; onUpdate: (next: number) => void;
}) {
  return <label>{label}<input key={value} type="number" inputMode="decimal" step="any" min={minimum} max={maximum}
    defaultValue={value} required onBlur={event => {
      const input = event.currentTarget;
      if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) input.value = String(value);
      else if (value !== input.valueAsNumber) onUpdate(input.valueAsNumber);
    }} onKeyDown={event => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        event.currentTarget.value = String(value);
        event.currentTarget.blur();
      }
    }} /></label>;
}

function ImpedanceFields({ name, impedance, onUpdate }: { name: string; impedance: Complex; onUpdate: (next: Complex) => void }) {
  return <div className="seq-impedance">
    <NumberField label={`${name} R, Ω`} value={impedance.re} minimum={0} maximum={1e6} onUpdate={re => onUpdate({ ...impedance, re })} />
    <NumberField label={`${name} X, Ω`} value={impedance.im} minimum={-1e6} maximum={1e6} onUpdate={im => onUpdate({ ...impedance, im })} />
  </div>;
}

function readingFor(readings: readonly SectionReading[], id: string | undefined, area: Area, at: number): SectionReading | undefined {
  return readings.find(reading => reading.id === id)
    ?? readings.filter(reading => reading.area === area)
      .sort((a, b) => Math.abs(a.to - at) - Math.abs(b.to - at) || a.from - b.from)[0]
    ?? readings[0];
}

export default function SequenceLab({ language }: { language: Language }) {
  const t = copy[language];
  const [history, setHistory] = useState(() => ({ document: newSequenceDocument(), past: [] as SequenceDocument[], future: [] as SequenceDocument[] }));
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [chosen, setChosen] = useState<{ area: Area; at: number; id?: string }>({ area: "line", at: 1 });
  const [editing, setEditing] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [ready, setReady] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const { document, past, future } = history;
  const solution = useMemo(() => solveSequence(document), [document]);
  const reading = solution.ok ? readingFor(solution.readings, chosen.id, chosen.area, chosen.at) : undefined;
  const number = (value: number) => formatEngineeringNumber(value, language);
  useEffect(() => setReady(true), []);

  function commit(next: SequenceDocument) {
    try {
      const accepted = validateSequenceDocument(next);
      ++generation.current;
      setHistory(previous => ({ document: accepted, past: [...previous.past, previous.document].slice(-40), future: [] }));
      setNotice(undefined);
      return true;
    } catch (error) {
      setNotice(error instanceof Error && error.message === "too-many-sequence-edits" ? t.limit : t.invalid);
      return false;
    }
  }

  function stepHistory(direction: "undo" | "redo") {
    ++generation.current;
    setEditing(undefined);
    setNotice(undefined);
    setHistory(previous => {
      const target = direction === "undo" ? previous.past.at(-1) : previous.future[0];
      if (!target) return previous;
      return direction === "undo" ? { document: target, past: previous.past.slice(0, -1), future: [previous.document, ...previous.future] }
        : { document: target, past: [...previous.past, previous.document], future: previous.future.slice(1) };
    });
  }

  function changeImpedance(area: Area, index: number, value: Complex) {
    const terms = [...document.sections[area]] as [Complex, Complex, Complex];
    terms[index] = value;
    commit({ ...document, sections: { ...document.sections, [area]: terms as Triple } });
  }

  function changeNeutral(side: NeutralSide, value: Neutral) {
    commit({ ...document, [neutralKey(side)]: value });
  }

  function setLocation(area: Area, at: number) {
    setDraft(previous => ({ ...previous, area, at: String(at) }));
    setChosen({ area, at });
  }

  function saveEdit() {
    const location = { id: editing ?? nextSequenceEditId(document), area: draft.area, at: Number(draft.at), phases: draft.phases };
    const impedance = z(Number(draft.resistance), Number(draft.reactance));
    const item: SequenceEdit = draft.kind === "open" ? { ...location, kind: draft.kind }
      : draft.kind === "series" ? { ...location, kind: draft.kind, impedance }
      : { ...location, kind: draft.kind, impedance, target: draft.target };
    const edits = editing ? document.edits.map(current => current.id === editing ? item : current) : [...document.edits, item];
    if (commit({ ...document, edits })) {
      setEditing(undefined);
      setChosen({ area: item.area, at: item.at });
    }
  }

  function editItem(item: SequenceEdit) {
    setEditing(item.id);
    setDraft({ area: item.area, at: String(item.at), kind: item.kind, phases: item.phases,
      target: item.kind === "shunt" ? item.target : "ground",
      resistance: item.kind === "open" ? "0" : String(item.impedance.re),
      reactance: item.kind === "open" ? "0" : String(item.impedance.im) });
    setChosen({ area: item.area, at: item.at });
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "electrotutor-three-phase-sequences.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(archive: File) {
    const pending = ++generation.current;
    try {
      if (archive.size > sequenceArchiveBytes) throw Error("sequence-archive-limit");
      const imported = readSequenceDocument(await archive.text());
      if (generation.current === pending && commit(imported)) setEditing(undefined);
    } catch {
      if (generation.current === pending) setNotice(t.importError);
    }
  }

  return <div className="seq-lab" data-seq-lab data-ready={String(ready)}>
    <SequenceCircuit document={document} language={language} selectedArea={draft.area} selectedAt={Number(draft.at)}
      onSelect={setLocation} controls={<div className="seq-schematic-settings">
        {areas.map(area => <details key={area} className="seq-parameter-area" data-seq-impedance-settings={area}>
          <summary>{t.area[area]} · Z</summary>
          {document.sections[area].map((impedance, index) => <ImpedanceFields key={index} name={`Z${index}`} impedance={impedance}
            onUpdate={value => changeImpedance(area, index, value)} />)}
        </details>)}
      </div>} />
    <div className="seq-workspace">
      <section className="seq-panel" aria-label={t.editHeading}>
        <h2>{t.editHeading}</h2>
        <form className="seq-edit-form" onSubmit={event => { event.preventDefault(); saveEdit(); }}>
          <label>{t.where}<select data-seq-area value={draft.area} onChange={event =>
            setDraft(previous => ({ ...previous, area: event.target.value as Area }))}>
            {areas.map(area => <option key={area} value={area}>{t.area[area]}</option>)}
          </select></label>
          <label>{t.point}<input data-seq-at type="number" inputMode="decimal" min={0} max={1} step="any" required
            value={draft.at} onChange={event => setDraft(previous => ({ ...previous, at: event.target.value }))} /></label>
          <label>{t.what}<select data-seq-kind value={draft.kind} onChange={event =>
            setDraft(previous => ({ ...previous, kind: event.target.value as SequenceEdit["kind"] }))}>
            {(["series", "open", "shunt"] as const).map(kind => <option key={kind} value={kind}>{t.edit[kind]}</option>)}
          </select></label>
          <fieldset className="seq-phase-pick"><legend>{t.phase}</legend>
            {phases.map(phase => <label key={phase}><input type="checkbox" data-seq-phase={phase}
              checked={draft.phases.includes(phase)} onChange={event => {
                const checked = event.target.checked;
                setDraft(previous => ({ ...previous, phases: checked ? [...previous.phases, phase] : previous.phases.filter(item => item !== phase),
                  target: checked && previous.target === phase ? "ground" : previous.target }));
              }} />{phase}</label>)}
          </fieldset>
          {draft.kind === "shunt" && <label>{t.target}<select data-seq-target value={draft.target}
            onChange={event => setDraft(previous => ({ ...previous, target: event.target.value as Draft["target"] }))}>
            <option value="ground">{t.ground}</option>
            {phases.filter(phase => !draft.phases.includes(phase)).map(phase => <option key={phase} value={phase}>{phase}</option>)}
          </select></label>}
          {draft.kind !== "open" && <div className="seq-impedance">
            <label>R, Ω<input data-seq-edit-r type="number" min={0} max={1e6} step="any" required value={draft.resistance}
              onChange={event => setDraft(previous => ({ ...previous, resistance: event.target.value }))} /></label>
            <label>X, Ω<input data-seq-edit-x type="number" min={-1e6} max={1e6} step="any" required value={draft.reactance}
              onChange={event => setDraft(previous => ({ ...previous, reactance: event.target.value }))} /></label>
          </div>}
          {draft.kind === "shunt" && draft.target === "ground" && draft.phases.length > 1 && <small>{t.shared}</small>}
          <div className="seq-actions">
            <button type="submit" data-seq-add disabled={!ready || !draft.phases.length || !editing && document.edits.length >= sequenceEditLimit}>
              {editing ? t.apply : t.add}</button>
            {editing && <button type="button" onClick={() => setEditing(undefined)}>{t.cancel}</button>}
          </div>
        </form>
        {document.edits.length ? <ul className="seq-edit-list">{document.edits.map(item => <li key={item.id} data-seq-edit={item.id}>
          <span><strong>{item.id} · {t.edit[item.kind]}</strong><small>{t.area[item.area]} · {number(item.at)} · {item.phases.join(", ")}
            {item.kind === "shunt" && ` → ${item.target === "ground" ? t.ground : item.target}`}
            {item.kind !== "open" && ` · ${number(item.impedance.re)} ${item.impedance.im < 0 ? "−" : "+"} j${number(Math.abs(item.impedance.im))} Ω`}</small></span>
          <div className="seq-actions"><button type="button" data-seq-change-edit={item.id} onClick={() => editItem(item)}>{t.change}</button>
            <button type="button" data-seq-remove-edit={item.id} onClick={() => {
              if (commit({ ...document, edits: document.edits.filter(entry => entry.id !== item.id) }) && editing === item.id) setEditing(undefined);
            }}>{t.remove}</button></div>
        </li>)}</ul> : <p className="seq-muted">{t.noEdits}</p>}
      </section>
      <section className="seq-panel" aria-label={t.parameters}>
        <h2>{t.parameters}</h2>
        <div className="seq-source-settings">
          <NumberField label={t.source} value={document.sourceVolts} minimum={0} maximum={1e6} onUpdate={sourceVolts => commit({ ...document, sourceVolts })} />
          <NumberField label={t.frequency} value={document.frequencyHz} minimum={.001} maximum={1e6} onUpdate={frequencyHz => commit({ ...document, frequencyHz })} />
        </div>
        {(["generator", "load"] as const).map(side => {
          const neutral = document[neutralKey(side)];
          return <div key={side} className="seq-neutral-settings"><label>{t.neutral} · {t.area[side]}
            <select data-seq-neutral={side} value={neutral.mode} onChange={event =>
              changeNeutral(side, { ...neutral, mode: event.target.value as Neutral["mode"] })}>
              <option value="grounded">{t.grounded}</option><option value="isolated">{t.isolated}</option>
            </select></label>
            {neutral.mode === "grounded" && <ImpedanceFields name="Zn" impedance={neutral.impedance}
              onUpdate={impedance => changeNeutral(side, { ...neutral, impedance })} />}
          </div>;
        })}
      </section>
    </div>
    {notice && <p role="alert" className="seq-notice">{notice}</p>}
    {solution.ok && reading ? <section className="seq-calculation" data-seq-selected-section={reading.id}>
      <label className="seq-reader">{t.read}
        <select data-seq-section-select value={reading.id} onChange={event => {
          const selected = solution.readings.find(item => item.id === event.target.value);
          if (selected) setChosen({ id: selected.id, area: selected.area, at: selected.to });
        }}>
          {solution.readings.map(item => <option key={item.id} value={item.id}>
            {`${t.area[item.area]} · ${number(item.from)} → ${number(item.to)}${item.from === item.to ? ` · ${item.id}` : ""}`}
          </option>)}
        </select>
      </label>
      <SequenceResults document={document} solution={solution} reading={reading} language={language} />
    </section> : <p role="alert" className="seq-notice" data-seq-model-error={!solution.ok ? solution.reason : "range"}>
      {t.reason[!solution.ok ? solution.reason : "range"]}
    </p>}
    <div className="seq-actions seq-archive" role="group" aria-label={t.archive}>
      <button type="button" onClick={() => { if (commit(newSequenceDocument())) setEditing(undefined); }}>{t.reset}</button>
      <button type="button" data-seq-undo disabled={!past.length} onClick={() => stepHistory("undo")}>{t.undo}</button>
      <button type="button" data-seq-redo disabled={!future.length} onClick={() => stepHistory("redo")}>{t.redo}</button>
      <button type="button" data-seq-download onClick={download}>{t.download}</button>
      <button type="button" disabled={!ready} onClick={() => file.current?.click()}>{t.import}</button>
      {ready && <input ref={file} type="file" data-seq-import hidden accept=".json,application/json" onChange={event => {
        const archive = event.target.files?.[0];
        event.target.value = "";
        if (archive) void upload(archive);
      }} />}
    </div>
  </div>;
}
