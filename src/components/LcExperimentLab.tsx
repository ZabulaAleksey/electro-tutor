import { useEffect, useRef, useState } from "react";
import { maxCircuitFileBytes } from "../circuit/document";
import {
  analyzeLcExperiment, newLcExperiment, readLcExperiment,
} from "../circuit/lc-experiment";
import { applyCauerTopology, applyExactLcTopology, fosterTopologyDraft, type FosterTerm, type LcForm } from "../circuit/lc-synthesis-document";
import { parseTopologyLabDocument, type TopologyLabDocument } from "../circuit/topology-session";
import type { CircuitComponent } from "../circuit/topology";
import { verifyLcRationalIdentity, type FosterVerification } from "../models/lc-synthesis-equivalence";
import type { CauerElement } from "../models/reactive-cauer-i";
import type { LcPortAnalysis } from "../models/reactive-lc-graph";
import { isNominal, MAX_VALUE, MIN_VALUE } from "../models/reactive-two-port";
import type { Language } from "../types";
import { CauerResults } from "./CauerResults";
import { FosterResults } from "./FosterResults";
import LineExperimentEditor from "./LineExperimentEditor";
import { LcTransformationResults, type AppliedLcSynthesis } from "./LcTransformationResults";
import { ReactiveImpedanceResults } from "./ReactiveImpedanceResults";
import { SimplifiedLcResults } from "./SimplifiedLcResults";
import "./ReactiveTwoPortLab.css";
import "./LcExperimentLab.css";

const copy = {
  ru: {
    port: "Два внешних вывода измерения",
    undo: "Отменить", redo: "Повторить", archive: "Архив схемы", save: "Сохранить JSON", openFile: "Открыть JSON",
    inductance: "Индуктивность, мГн", capacitance: "Ёмкость, мкФ",
    nominalError: "Допустимый номинал от 0,001 до 100 000 с шагом 0,001.",
    range: "Расчёт поддерживает до 24 элементов L/C и 12 связанных узлов.",
    archiveError: "Файл LC не открыт. Проверьте формат, порт и номиналы.",
    invalid: "Проверьте соединения, порт и параметры L/C.",
    proofFailed: "Эквивалентность редактируемой схемы не подтверждена. Исходная схема сохранена.",
    foster: "Форма Фостера", cauer: "Форма Кауэра",
    open: "Внешние выводы разомкнуты. Пути для тока нет.",
    short: "Внешние выводы соединены общим проводом.",
  },
  uk: {
    port: "Два зовнішні виводи вимірювання",
    undo: "Скасувати", redo: "Повторити", archive: "Архів схеми", save: "Зберегти JSON", openFile: "Відкрити JSON",
    inductance: "Індуктивність, мГн", capacitance: "Ємність, мкФ",
    nominalError: "Допустимий номінал від 0,001 до 100 000 із кроком 0,001.",
    range: "Розрахунок підтримує до 24 елементів L/C і 12 зв’язаних вузлів.",
    archiveError: "Файл LC не відкрито. Перевірте формат, порт і номінали.",
    invalid: "Перевірте з’єднання, порт і параметри L/C.",
    proofFailed: "Еквівалентність редагованої схеми не підтверджено. Початкове коло збережено.",
    foster: "Форма Фостера", cauer: "Форма Кауера",
    open: "Зовнішні виводи розімкнені. Шляху для струму немає.",
    short: "Зовнішні виводи з'єднані спільним проводом.",
  },
} as const;

type Snapshot = { document: TopologyLabDocument; result: LcPortAnalysis };
type History = { current: Snapshot; past: Snapshot[]; future: Snapshot[] };

function starter(): History {
  const document = newLcExperiment();
  return { current: { document, result: analyzeLcExperiment(document) }, past: [], future: [] };
}

export default function LcExperimentLab({ language }: { language: Language }) {
  const t = copy[language];
  const [ready, setReady] = useState(false);
  const [{ current, past, future }, setHistory] = useState(starter);
  const [cursor, setCursor] = useState<number | null>(null);
  const [applied, setApplied] = useState<AppliedLcSynthesis>();
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string }>();
  const file = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const { document: experiment, result } = current;
  const port = experiment.topology.components.find(part => part.kind === "port");
  useEffect(() => setReady(true), []);

  function commit(next: TopologyLabDocument) {
    ++importGeneration.current;
    if (next === experiment) return false;
    try {
      const accepted = { document: next, result: analyzeLcExperiment(next) };
      setHistory(previous => ({
        current: accepted, past: [...previous.past, previous.current].slice(-64), future: [],
      }));
      setCursor(null);
      setNotice(undefined);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setNotice({ type: "error", text: reason === "lc-graph-limit" ? t.range : reason === "invalid-lc-value" ? t.nominalError : t.invalid });
      return false;
    }
  }

  function applyLocal(topology: TopologyLabDocument["topology"], values: Parameters<typeof applyExactLcTopology>[2]) {
    try {
      const next = applyExactLcTopology(experiment, topology, values);
      return commit(next) ? next : undefined;
    } catch { setNotice({ type: "error", text: t.proofFailed }); }
  }

  function applyForm(name: string, form: LcForm, prepare: () => TopologyLabDocument) {
    if (result.kind !== "finite") return;
    try {
      const next = prepare();
      const rebuilt = analyzeLcExperiment(next);
      if (rebuilt.kind !== "finite") throw Error("lc-synthesis-equivalence");
      const proof = verifyLcRationalIdentity(result.impedance, rebuilt.impedance);
      if (commit(next)) setApplied({ name: `${name} ${form.toUpperCase()}`, before: experiment, after: next,
        sourceImpedance: result.impedance, coefficientError: proof.coefficientError, coefficientTolerance: proof.coefficientTolerance });
    } catch { setNotice({ type: "error", text: t.proofFailed }); }
  }

  function applyCauer(form: LcForm, elements: readonly CauerElement[]) {
    applyForm(t.cauer, form, () => applyCauerTopology(experiment, form, elements));
  }

  function applyFoster(form: LcForm, terms: readonly FosterTerm[], proof: FosterVerification) {
    applyForm(t.foster, form, () => fosterTopologyDraft(experiment, form, terms, proof.nominalWitnesses));
  }

  function history(direction: "undo" | "redo") {
    ++importGeneration.current;
    setHistory(previous => {
      if (direction === "undo") {
        const earlier = previous.past.at(-1);
        return earlier ? { current: earlier, past: previous.past.slice(0, -1), future: [previous.current, ...previous.future] } : previous;
      }
      const later = previous.future[0];
      return later ? { current: later, past: [...previous.past, previous.current], future: previous.future.slice(1) } : previous;
    });
    setNotice(undefined);
    setCursor(null);
  }

  function updateNominal(part: CircuitComponent, nominal: number) {
    const property = part.kind === "l" ? "henry" : "farad";
    const value = Number((nominal / (part.kind === "l" ? 1_000 : 1_000_000)).toPrecision(12));
    if (part.parameters[property] === value) return;
    const parameters = { ...part.parameters, [property]: value };
    delete parameters.lcExact;
    const next = parseTopologyLabDocument(JSON.stringify({
      ...experiment, topology: { ...experiment.topology, components: experiment.topology.components.map(component =>
        component.id === part.id ? { ...component, parameters } : component) },
    }));
    commit(next);
  }

  function inspector(part: CircuitComponent) {
    if (part.kind !== "l" && part.kind !== "c") return null;
    const inductive = part.kind === "l";
    const label = inductive ? t.inductance : t.capacitance;
    const valueSI = Number(part.parameters[inductive ? "henry" : "farad"]);
    const nominal = part.parameters.lcExact
      ? Number((valueSI * (inductive ? 1e3 : 1e6)).toPrecision(10))
      : Math.round(valueSI * (inductive ? 1e6 : 1e9)) / 1_000;
    return <>
      <label className="lc-experiment-value">
        <span>{label}</span>
        <input key={part.id + ":" + nominal} type="number" min={MIN_VALUE} max={MAX_VALUE} step=".001"
          data-lc-nominal defaultValue={nominal}
          onBlur={event => {
            const value = event.currentTarget.valueAsNumber;
            if (value === nominal) return;
            if (isNominal(value)) updateNominal(part, value);
            else {
              event.currentTarget.value = String(nominal);
              setNotice({ type: "error", text: t.nominalError });
            }
          }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") { event.currentTarget.value = String(nominal); event.currentTarget.blur(); }
          }} />
      </label>
    </>;
  }

  function download() {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([JSON.stringify(experiment, null, 2)], { type: "application/json" }));
    anchor.download = "electrotutor-lc.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
  }

  async function upload(value: File) {
    const generation = ++importGeneration.current;
    try {
      if (value.size > maxCircuitFileBytes) throw Error("file-limit");
      const parsed = readLcExperiment(await value.text());
      if (generation === importGeneration.current) commit(parsed);
    } catch {
      if (generation === importGeneration.current) setNotice({ type: "error", text: t.archiveError });
    }
  }

  return <fieldset className="lab-hydration-guard" disabled={!ready}>
    <div className="lc-experiment" data-lc-experiment data-ready={String(ready)}>
      <LineExperimentEditor language={language} variant="lc" document={experiment} onChange={commit}
        onRestoreStarter={() => commit(newLcExperiment())}
        renderInspector={inspector} />
      <div className="lc-experiment-tools" role="group" aria-label={t.archive}>
        <p>{t.port} · {port?.id}</p>
        <button type="button" data-lc-undo disabled={past.length === 0} onClick={() => history("undo")}>{t.undo}</button>
        <button type="button" data-lc-redo disabled={future.length === 0} onClick={() => history("redo")}>{t.redo}</button>
        <button type="button" data-lc-export onClick={download}>{t.save}</button>
        <button type="button" onClick={() => file.current?.click()}>{t.openFile}</button>
        {ready && <input type="file" data-lc-import ref={file} hidden accept=".json,application/json" onChange={event => {
          const value = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (value) void upload(value);
        }} />}
      </div>
      {notice && <p role={notice.type === "error" ? "alert" : "status"} data-lc-notice={notice.type}>{notice.text}</p>}
      <div className="lc-graph-results" data-lc-experiment-result={result.kind}>
        {result.kind === "finite" ? <ReactiveImpedanceResults impedance={result.impedance} language={language} cursor={cursor} setCursor={setCursor} />
          : <section className="lc-panel lc-results" aria-live="polite">
              <p data-lc-formula>{result.kind === "short" ? "Z(s) = 0 Ω" : "Z(s) → ∞"}</p>
              <p>{t[result.kind]}</p>
            </section>}
        <SimplifiedLcResults topology={experiment.topology} observedEndpoints={experiment.observedEndpoints} language={language} />
        <FosterResults result={result} cursor={cursor} language={language} form="i" onApply={(terms, proof) => applyFoster("i", terms, proof)} />
        <FosterResults result={result} cursor={cursor} language={language} form="ii" onApply={(terms, proof) => applyFoster("ii", terms, proof)} />
        <CauerResults result={result} cursor={cursor} language={language} form="i" onApply={elements => applyCauer("i", elements)} />
        <CauerResults result={result} cursor={cursor} language={language} form="ii" onApply={elements => applyCauer("ii", elements)} />
        {result.kind === "finite" && <LcTransformationResults document={experiment} analysis={result} language={language}
          onApply={plan => applyLocal(plan.topology, plan.values)} applied={applied?.after === experiment ? applied : undefined} />}
      </div>
    </div>
  </fieldset>;
}
