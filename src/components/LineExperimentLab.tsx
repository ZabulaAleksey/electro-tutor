import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { networkError } from "../transient/network-copy";
import { lineArchiveByteLimit } from "../transient/line-archive-document";
import {
  appendExperimentSection, lineExperimentModel, newLineExperiment, observationAt, readLineExperiment,
  type LineExperiment, type LineObservation,
} from "../transient/line-experiment";
import type { Language } from "../types";
import LineExperimentEditor from "./LineExperimentEditor";
import LineExperimentResults, { PlaybackBar } from "./LineExperimentResults";

const copy = {
  ru: {
    archive: "Архив опыта", download: "Сохранить JSON", upload: "Открыть JSON",
    undo: "Отменить", redo: "Повторить",
    archiveError: "Архив не открыт. Проверьте формат файла и выбранную секцию.",
    openInput: "Идеальный источник тока: ненулевой ток при разомкнутом входном ключе не даёт конечного решения.",
    sectionLimit: "Можно каскадировать до шести секций.",
  },
  uk: {
    archive: "Архів досліду", download: "Зберегти JSON", upload: "Відкрити JSON",
    undo: "Скасувати", redo: "Повторити",
    archiveError: "Архів не відкрито. Перевірте формат файлу й вибрану секцію.",
    openInput: "Ідеальне джерело струму: ненульовий струм при розімкненому вхідному ключі не дає скінченного розв’язку.",
    sectionLimit: "Можна каскадувати до шести секцій.",
  },
} as const;

export default function LineExperimentLab({ language }: { language: Language }) {
  const t = copy[language];
  const [{ experiment, past, future }, setHistory] = useState(() => ({
    experiment: newLineExperiment(), past: [] as LineExperiment[], future: [] as LineExperiment[],
  }));
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [recovery, setRecovery] = useState<string>();
  const [edited, setEdited] = useState(false);
  const lastRaw = useRef<string | null>(null);
  const lastValue = useRef<LineExperiment | null>(null);
  const savedCircuit = useRef<TopologyLabDocument | null>(null);
  const key = "electrotutor:line-experiment:v1";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      lastRaw.current = saved;
      if (saved !== null) {
        try {
          const experiment = readLineExperiment(saved);
          lastValue.current = experiment;
          savedCircuit.current = experiment.circuit;
          setHistory({ experiment, past: [], future: [] });
        } catch { setRecovery(saved); }
      }
    } catch { setStorageError(true); }
    setRestored(true);
  }, []);
  useLayoutEffect(() => {
    if (!restored || !edited || recovery !== undefined) return;
    function save() {
      if (lastValue.current === experiment) return;
      try {
        const current = localStorage.getItem(key);
        if (current !== lastRaw.current) { setRecovery(current ?? ""); return; }
        const text = JSON.stringify(experiment);
        localStorage.setItem(key, text);
        lastRaw.current = text;
        lastValue.current = experiment;
        savedCircuit.current = experiment.circuit;
        setStorageError(false);
      } catch { setStorageError(true); }
    }
    // Write structural edits before the next paint. Cursor/playback updates are
    // coalesced and flushed when the document is about to leave the page.
    if (savedCircuit.current !== experiment.circuit) save();
    const timer = window.setTimeout(save, 180);
    window.addEventListener("pagehide", save);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [experiment, restored, edited, recovery]);
  useEffect(() => {
    if (!edited || (!storageError && recovery === undefined)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited, storageError, recovery]);
  const [view, setView] = useState<"editor" | "results">("editor");
  const [actionError, setActionError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);
  const { circuit, durationS, selectedSection } = experiment;
  const projection = useMemo(() => {
    try { return { model: lineExperimentModel(circuit, durationS) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [circuit, durationS]);

  const activeSection = selectedSection ?? projection.model?.sections[0]?.id;

  function report(error: unknown) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "inconsistent-ideal-current-source-and-open-switch") return t.openInput;
    if (code === "line-section-limit") return t.sectionLimit;
    return networkError(code, language);
  }

  function updateExperiment(update: (previous: LineExperiment) => LineExperiment, undoable = false) {
    setEdited(true);
    setHistory(previous => {
      const next = update(previous.experiment);
      if (next === previous.experiment) return previous;
      return undoable
        ? { experiment: next, past: [...previous.past, previous.experiment].slice(-64), future: [] }
        : { ...previous, experiment: next };
    });
  }

  function undo() {
    ++importGeneration.current;
    setHistory(previous => {
      const last = previous.past.at(-1);
      return last ? { experiment: last, past: previous.past.slice(0, -1), future: [previous.experiment, ...previous.future] } : previous;
    });
    setActionError("");
  }

  function redo() {
    ++importGeneration.current;
    setHistory(previous => {
      const next = previous.future[0];
      return next ? { experiment: next, past: [...previous.past, previous.experiment], future: previous.future.slice(1) } : previous;
    });
    setActionError("");
  }

  function edit(next: TopologyLabDocument) {
    ++importGeneration.current;
    const sectionIds = new Set(next.topology.components.filter(part => part.kind === "line").map(({ id }) => id));
    const lastSwitchS = Math.max(0, ...next.topology.components.filter(({ kind }) => kind === "switch")
      .map(({ parameters }) => Number(parameters.atS ?? 0)));
    updateExperiment(previous => {
      if (previous.circuit === next) return previous;
      const nextDurationS = lastSwitchS >= previous.durationS ? Math.min(10, lastSwitchS + .02) : previous.durationS;
      return {
        ...previous, circuit: next, durationS: nextDurationS,
        selectedSection: previous.selectedSection && sectionIds.has(previous.selectedSection) ? previous.selectedSection : null,
        observations: Object.fromEntries(Object.entries(previous.observations).filter(([id]) => sectionIds.has(id))
          .map(([id]) => [id, observationAt({ ...previous, circuit: next, durationS: nextDurationS }, id)])),
      };
    }, true);
    setActionError("");
  }

  function openSection(id: string) {
    if (!projection.model?.sections.some(section => section.id === id)) return;
    updateExperiment(previous => ({ ...previous, selectedSection: id }));
    setActionError("");
    setView("results");
  }

  function updateObservation(value: LineObservation) {
    if (!activeSection) return;
    updateExperiment(previous => ({
      ...previous,
      observations: { ...previous.observations, [activeSection]: value },
    }));
  }

  function durationChanged(next: number) {
    try {
      lineExperimentModel(circuit, next);
      updateExperiment(previous => ({
        ...previous, durationS: next,
        observations: Object.fromEntries(Object.entries(previous.observations)
          .map(([id]) => [id, observationAt({ ...previous, durationS: next }, id)])),
      }), true);
      setActionError("");
    } catch (error) { setActionError(report(error)); }
  }

  function download(text = JSON.stringify(experiment, null, 2)) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = "electrotutor-line-experiment.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function upload(archive: File) {
    const generation = ++importGeneration.current;
    try {
      if (archive.size > lineArchiveByteLimit) throw Error("line-experiment-file-limit");
      const next = readLineExperiment(await archive.text());
      if (generation !== importGeneration.current) return;
      updateExperiment(() => next, true);
      setView("editor");
      setActionError("");
    } catch {
      if (generation === importGeneration.current) setActionError(t.archiveError);
    }
  }

  return <div data-line-a-lab data-line-a-view={view}>
    {activeSection && projection.model
      ? <LineExperimentResults language={language} sectionId={activeSection} model={projection.model} showResults={view === "results"}
          onBack={() => { setView("editor"); setActionError(""); }}
          durationS={durationS} onDurationChange={durationChanged}
          observation={observationAt(experiment, activeSection)} onObservationChange={updateObservation} />
      : <PlaybackBar language={language} disabled />}
    {view === "editor" && <>
          <LineExperimentEditor language={language} document={circuit} onChange={edit} onOpenSection={openSection}
            validateParameters={next => { if (projection.model) lineExperimentModel(next, durationS); }}
            onAppendSection={() => {
              try { edit(appendExperimentSection(circuit, durationS)); }
              catch (error) { setActionError(report(error)); }
            }} />
          {recovery !== undefined && <div role="alert">
            {language === "ru" ? "Локальный архив требует восстановления или изменён в другой вкладке. Исходная запись сохранена." : "Локальний архів потребує відновлення або змінений в іншій вкладці. Вихідний запис збережено."}
            <button type="button" onClick={() => download(recovery)}>{language === "ru" ? "Скачать исходный архив" : "Завантажити вихідний архів"}</button>
            <button type="button" onClick={() => {
              if (window.confirm(language === "ru" ? "Заменить локальный архив текущей схемой?" : "Замінити локальний архів поточною схемою?")) {
                lastRaw.current = recovery || null; lastValue.current = null;
                savedCircuit.current = null; setRecovery(undefined); setEdited(true);
              }
            }}>{language === "ru" ? "Сохранить текущую схему" : "Зберегти поточну схему"}</button>
          </div>}
          {storageError && <p role="status">{language === "ru" ? "Не удалось прочитать или сохранить локальную копию. Схему можно сохранить в JSON." : "Не вдалося прочитати або зберегти локальну копію. Схему можна зберегти у JSON."}</p>}
          {projection.error && <p role="alert" data-line-a-model-error>{report(projection.error)}</p>}
        </>}
    {actionError && <p role="alert" data-line-a-action-error>{actionError}</p>}
    <div className="line-a-archive" role="group" aria-label={t.archive}>
      {view === "editor" && <>
        <button type="button" onClick={() => {
          if (window.confirm(language === "ru" ? "Восстановить начальную схему?" : "Відновити початкову схему?")) {
            ++importGeneration.current;
            if (recovery !== undefined) lastRaw.current = recovery || null;
            setRecovery(undefined);
            savedCircuit.current = null;
            updateExperiment(() => newLineExperiment(), true);
            setActionError("");
          }
        }}>{language === "ru" ? "Начальная схема" : "Початкова схема"}</button>
        <button type="button" onClick={undo} disabled={!past.length} data-line-a-undo>{t.undo}</button>
        <button type="button" onClick={redo} disabled={!future.length} data-line-a-redo>{t.redo}</button>
      </>}
      <button type="button" data-line-a-download onClick={() => download()}>{t.download}</button>
      <button type="button" data-line-a-upload onClick={() => file.current?.click()}>{t.upload}</button>
      <input type="file" ref={file} data-line-a-import hidden accept=".json,application/json" onChange={event => {
        const archive = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (archive) void upload(archive);
      }} />
    </div>
  </div>;
}
