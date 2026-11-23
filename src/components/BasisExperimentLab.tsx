import { useEffect, useMemo, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import {
  basisExperimentMaxBytes, basisExpressionMaxLength, basisTermLimit, experimentBasisIds, experimentSampleCounts,
  polynomialTermLimit, waveletBases,
  type BasisAnalysis, type BasisExperiment, type BasisExperimentSource, type ExperimentBasisId, type ExperimentBoundary,
} from "../fourier/basis-experiment-contract";
import {
  defaultBasisExperiment, experimentBoundary, readBasisExperiment, sampleBasisExperiment, writeBasisExperiment,
} from "../fourier/basis-experiment";
import { analyzeBasis } from "../fourier/basis-experiment-math";
import { contourShape } from "../fourier/contour";
import type { Complex } from "../fourier/math";
import type { Language } from "../types";
import CustomBasisExperiment from "./CustomBasisExperiment";
import { BasisFunctionCanvas } from "./BasisFunctionCanvas";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { BasisContourCanvas, BasisEpicycles, BasisSignalPlot } from "./BasisExperimentGraphics";
import "./BasisExperimentLab.css";

const copy = {
  ru: {
    source: "Входные данные", signal: "Функция", contour: "Контур", expression: "Функция на [0, 1]",
    apply: "Применить функцию", expressionHelp: "Используйте x или t, например sin(2*pi*x) или 2*step(0.5)-1.",
    applied: "Применённая функция",
    boundary: "Границы сетки", periodic: "Периодическая, без последней точки", open: "Открытая, с обеими границами",
    drawHelp: "Нарисуйте контур внутри пунктирной рамки. Новый штрих заменяет предыдущий.",
    close: "Замкнуть контур", square: "Пример контура", clear: "Очистить", undo: "Отменить правку",
    settings: "Разложение", basis: "Базис", samples: "Отсчёты N", count: "Члены суммы K", level: "Уровень J",
    rms: "Ошибка RMS", max: "Наибольшая ошибка", coefficients: "Коэффициенты", coefficient: "Член",
    comparison: "Сравнение базисов", budget: "Один вход и одинаковое число членов",
    term: "Показать вклад члена", active: "Входит в сумму", inactive: "Вне суммы",
    position: "Знаковые частоты k. Нормировка DFT 1/N, отбор по |c|.",
    orthonormal: "Порядок Адамара (Сильвестра), нормировка 1/√N. Отбор по |c|.",
    wavelet: "Ортонормированный DWT с периодическим продолжением массива. Отбор по |c|.",
    chebyshev: "Первые степени Tₙ на [−1, 1]. МНК с весом 1/√(1−x²).",
    legendre: "Первые степени Pₙ на [−1, 1]. МНК с весом 1.",
    seam: "При периодическом продолжении открытой сетки её края образуют стык.",
    save: "Сохранить JSON", load: "Открыть JSON", loaded: "Архив открыт. Результат пересчитан.",
    empty: "Чтобы рассчитать разложение, нарисуйте контур или загрузите пример.",
    insufficient: "Для замыкания нужны хотя бы три разные точки.",
    errors: {
      "invalid-expression": "Проверьте синтаксис функции. Сохранён прежний результат.",
      "invalid-grid": "Неподдерживаемый размер сетки или уровень.",
      "invalid-contour": "Не удалось использовать этот контур.",
      "insufficient-contour": "Добавьте точки контура.",
      "archive-limit": "Архив превышает 512 КиБ.",
      "invalid-archive": "Не удалось открыть архив. Текущий опыт сохранён.",
      "invalid-analysis": "Не удалось вычислить разложение.",
    },
    names: {
      fourier: "Фурье (DFT)", dct: "DCT-II", haar: "Хаар", walsh: "Уолш–Адамар", daubechies: "Добеши (db2)",
      symlets: "Симлеты (sym4)", coiflets: "Койфлеты (coif1)", chebyshev: "Чебышёв (T)", legendre: "Лежандр (P)",
    },
  },
  uk: {
    source: "Вхідні дані", signal: "Функція", contour: "Контур", expression: "Функція на [0, 1]",
    apply: "Застосувати функцію", expressionHelp: "Використовуйте x або t, наприклад sin(2*pi*x) чи 2*step(0.5)-1.",
    applied: "Застосована функція",
    boundary: "Межі сітки", periodic: "Періодична, без останньої точки", open: "Відкрита, з обома межами",
    drawHelp: "Намалюйте контур усередині пунктирної рамки. Новий штрих замінює попередній.",
    close: "Замкнути контур", square: "Приклад контуру", clear: "Очистити", undo: "Скасувати зміну",
    settings: "Розклад", basis: "Базис", samples: "Відліки N", count: "Члени суми K", level: "Рівень J",
    rms: "Похибка RMS", max: "Найбільша похибка", coefficients: "Коефіцієнти", coefficient: "Член",
    comparison: "Порівняння базисів", budget: "Один вхід і однакова кількість членів",
    term: "Показати внесок члена", active: "Входить до суми", inactive: "Поза сумою",
    position: "k зі знаком. DFT 1/N, першими йдуть члени з найбільшим |c|.",
    orthonormal: "Порядок Адамара (Сильвестра), нормування 1/√N. Відбір за |c|.",
    wavelet: "Ортонормований DWT із періодичним продовженням масиву. Відбір за |c|.",
    chebyshev: "Перші степені Tₙ на [−1, 1]. МНК із вагою 1/√(1−x²).",
    legendre: "Перші степені Pₙ на [−1, 1]. МНК із вагою 1.",
    seam: "За періодичного продовження відкритої сітки її краї утворюють стик.",
    save: "Зберегти JSON", load: "Відкрити JSON", loaded: "Архів відкрито. Результат перераховано.",
    empty: "Щоб обчислити розклад, намалюйте контур або завантажте приклад.",
    insufficient: "Щоб замкнути контур, потрібні щонайменше три різні точки.",
    errors: {
      "invalid-expression": "Перевірте синтаксис функції. Попередній результат збережено.",
      "invalid-grid": "Розмір сітки або рівень не підтримується.",
      "invalid-contour": "Не вдалося використати цей контур.",
      "insufficient-contour": "Додайте точки контуру.",
      "archive-limit": "Архів перевищує 512 КіБ.",
      "invalid-archive": "Не вдалося відкрити архів. Поточний дослід збережено.",
      "invalid-analysis": "Не вдалося обчислити розклад.",
    },
    names: {
      fourier: "Фур’є (DFT)", dct: "DCT-II", haar: "Гаар", walsh: "Волш–Адамар", daubechies: "Добеші (db2)",
      symlets: "Симлети (sym4)", coiflets: "Койфлети (coif1)", chebyshev: "Чебишов (T)", legendre: "Лежандр (P)",
    },
  },
} as const;

type Settings = Omit<BasisExperiment, "source">;
type Signal = Extract<BasisExperimentSource, { kind: "signal" }>;
type Contour = Extract<BasisExperimentSource, { kind: "contour" }>;
type ErrorCode = keyof typeof copy.ru.errors;
type Notice = { error: ErrorCode } | { loaded: true };
type Comparison = { basis: ExperimentBasisId; rms: number; max: number };

function errorCode(error: unknown, fallback: ErrorCode): ErrorCode {
  if (error instanceof Error && Object.hasOwn(copy.ru.errors, error.message)) return error.message as ErrorCode;
  return fallback;
}

function initialState() {
  const { source, ...settings } = defaultBasisExperiment();
  const emptyContour: Contour = { kind: "contour", closed: false, points: [] };
  const defaultSignal: Signal = { kind: "signal", expression: "1", boundary: "periodic" };
  const drawn: Extract<BasisExperimentSource, { kind: "drawn" }> = { kind: "drawn", values: Array<number>(257).fill(0), boundary: "open" };
  return { settings, drawn, mode: source.kind, signal: source.kind === "signal" ? source : defaultSignal,
    contour: source.kind === "contour" ? source : emptyContour };
}

function compute(experiment: BasisExperiment): {
  samples: Complex[];
  analysis?: BasisAnalysis;
  comparison: Comparison[];
  error?: ErrorCode;
} {
  if (experiment.source.kind === "contour" && experiment.source.points.length < 2) return { samples: [], comparison: [] };
  try {
    const samples = sampleBasisExperiment(experiment);
    const options = { ...experiment, boundary: experimentBoundary(experiment) };
    const analysis = analyzeBasis(samples, options);
    const budget = Math.min(experiment.count, polynomialTermLimit);
    const comparison = experimentBasisIds.map((basis) => {
      const { rms, max } = basis === experiment.basis && budget === options.count ? analysis :
        analyzeBasis(samples, { ...options, basis, count: budget });
      return { basis, rms, max };
    });
    return { samples, analysis, comparison };
  } catch (error) {
    return { samples: [], comparison: [], error: errorCode(error, "invalid-analysis") };
  }
}

export default function BasisExperimentLab({ language }: { language: Language }) {
  const t = copy[language];
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState(state.signal.expression);
  const [history, setHistory] = useState<Contour[]>([]);
  const [termIndex, setTermIndex] = useState<number>();
  const [notice, setNotice] = useState<Notice>();
  const [customOpen, setCustomOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const importFile = useRef<HTMLInputElement>(null);
  const archiveWork = useRef({ generation: 0 }).current;

  useEffect(() => {
    setReady(true);
    return () => { archiveWork.generation++; };
  }, [archiveWork]);

  const { mode, signal, drawn, contour, settings } = state;
  const experiment = useMemo<BasisExperiment>(() => ({ ...settings, source: mode === "signal" ? signal : mode === "drawn" ? drawn : contour }),
    [settings, mode, signal, drawn, contour]);
  const boundary = experimentBoundary(experiment);
  // Results depend on platform math and locale formatting. Keep the first
  // client render identical to the server controls and compute after hydration.
  const calculation = useMemo(() => ready ? compute(experiment) : undefined, [experiment, ready]);
  const { samples = [], analysis, comparison = [], error: computeError } = calculation ?? {};
  const term = analysis?.terms.find(({ index }) => index === termIndex) ?? analysis?.terms.find(({ active }) => active);
  const contribution = useMemo(() => term ? analysis?.contribution(term.index) : undefined, [analysis, term]);
  const budget = Math.min(settings.count, polynomialTermLimit);
  const error = (notice && "error" in notice ? notice.error : undefined) ?? computeError;
  const format = (value: number) => formatEngineeringNumber(value, language);
  const convention = settings.basis === "fourier" ? t.position : settings.basis === "dct" ? "DCT-II · cos(π(n + ½)k/N), ‖φₖ‖₂ = 1" : settings.basis === "walsh" ? t.orthonormal :
    waveletBases.has(settings.basis) ? t.wavelet : settings.basis === "chebyshev" ? t.chebyshev : t.legendre;

  function markEdit() {
    archiveWork.generation++;
    setNotice(undefined);
  }

  function changeSettings(change: Partial<Settings>, resetTerm = false) {
    markEdit();
    setState((current) => {
      const next = { ...current.settings, ...change };
      next.count = Math.min(next.count, basisTermLimit(next.basis, next.sampleCount));
      next.level = Math.min(next.level, Math.log2(next.sampleCount));
      return { ...current, settings: next };
    });
    if (resetTerm) setTermIndex(undefined);
  }

  function changeMode(next: BasisExperimentSource["kind"]) {
    if (mode === next) return;
    markEdit();
    setState((current) => ({ ...current, mode: next }));
    setTermIndex(undefined);
  }

  function applyExpression(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    markEdit();
    const candidate = { ...signal, expression: draft.trim() };
    try {
      sampleBasisExperiment({ ...settings, source: candidate });
      setState((current) => ({ ...current, signal: candidate }));
      setDraft(candidate.expression);
      setTermIndex(undefined);
    } catch (error) { setNotice({ error: errorCode(error, "invalid-expression") }); }
  }

  function changeBoundary(next: ExperimentBoundary) {
    markEdit();
    setState((current) => ({ ...current, signal: { ...current.signal, boundary: next } }));
  }

  function replaceContour(next: Contour) {
    markEdit();
    setHistory((previous) => [...previous.slice(-15), contour]);
    setState((current) => ({ ...current, contour: next }));
    setTermIndex(undefined);
  }

  function undoContour() {
    const previous = history.at(-1);
    if (!previous) return;
    markEdit();
    setHistory((entries) => entries.slice(0, -1));
    setState((current) => ({ ...current, contour: previous }));
    setTermIndex(undefined);
  }

  function exportArchive() {
    if (!analysis) return;
    const url = URL.createObjectURL(new Blob([writeBasisExperiment(experiment, analysis)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "electrotutor-basis-experiment.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importArchive(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const request = ++archiveWork.generation;
    try {
      if (file.size > basisExperimentMaxBytes) throw Error("archive-limit");
      const archive = readBasisExperiment(await file.text());
      if (request !== archiveWork.generation) return;
      const result = compute(archive);
      if (!result.analysis) throw Error(result.error ?? "invalid-archive");
      const { source, ...settings } = archive;
      setState((current) => ({ ...current, mode: source.kind, settings, [source.kind]: source }));
      if (source.kind === "signal") setDraft(source.expression);
      if (source.kind === "contour") setHistory([]);
      setTermIndex(undefined);
      setNotice({ loaded: true });
    } catch (error) {
      if (request === archiveWork.generation) {
        setNotice({ error: errorCode(error, "invalid-archive") === "archive-limit" ? "archive-limit" : "invalid-archive" });
      }
    }
  }

  const canClose = new Set(contour.points.map(({ re, im }) => `${re},${im}`)).size >= 3;

  return <section className="basis-experiment" data-basis-experiment data-ready={ready}>
    <fieldset disabled={!ready} className="lab-ready-guard basis-ready">
    <div className="basis-workspace">
      <section className="basis-card basis-source-panel">
        <div className="basis-panel-heading">
          <h2>{t.source}</h2>
          <div className="basis-source-controls" role="group" aria-label={t.source}>
            <button type="button" title={t.signal} data-basis-source="signal" aria-pressed={mode === "signal"} onClick={() => changeMode("signal")}>{t.signal}</button>
            <button type="button" title={language === "ru" ? "Нарисовать функцию" : "Намалювати функцію"} data-basis-source="drawn" aria-pressed={mode === "drawn"} onClick={() => changeMode("drawn")}>{language === "ru" ? "Нарисовать y(x)" : "Намалювати y(x)"}</button>
            <button type="button" title={t.contour} data-basis-source="contour" aria-pressed={mode === "contour"} onClick={() => changeMode("contour")}>{t.contour}</button>
          </div>
        </div>
        {mode === "signal" ? <>
          <label className="basis-field"><span>{language === "ru" ? "Готовая функция" : "Готова функція"}</span>
            <select value={["sin(2*pi*x)", "2*step(0.5)-1", "x", "1"].includes(signal.expression) ? signal.expression : ""} onChange={event => {
              const expression = event.currentTarget.value;
              if (!expression) return;
              markEdit(); setDraft(expression); setState(current => ({ ...current, signal: { ...current.signal, expression } }));
            }}>
              <option value="">{language === "ru" ? "Своя формула" : "Власна формула"}</option>
              {["sin(2*pi*x)", "2*step(0.5)-1", "x", "1"].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <form className="basis-function" onSubmit={applyExpression}>
            <label className="basis-field"><span>{t.expression}</span>
              <input data-basis-expression name="expression" type="text" maxLength={basisExpressionMaxLength} spellCheck={false}
                aria-invalid={error === "invalid-expression" || undefined} value={draft} onChange={(event) => {
                  markEdit(); setDraft(event.currentTarget.value);
                }} />
            </label>
            <button type="submit" title={t.apply} data-basis-apply-expression className="basis-primary">{t.apply}</button>
          </form>
          {error === "invalid-expression" && <p className="basis-error" role="alert" data-basis-error={error}>{t.errors[error]}</p>}
          <p className="basis-note">{t.expressionHelp}</p>
          {draft !== signal.expression && <p className="basis-note">{t.applied} <code>{signal.expression}</code></p>}
          <label className="basis-field basis-boundary"><span>{t.boundary}</span>
            <select data-basis-boundary value={signal.boundary} onChange={(event) => changeBoundary(event.currentTarget.value as ExperimentBoundary)}>
              <option value="periodic">{t.periodic}</option><option value="open">{t.open}</option>
            </select>
          </label>
          {analysis && contribution && <BasisSignalPlot language={language} boundary={boundary} samples={samples}
            reconstruction={analysis.reconstruction} contribution={contribution} />}
        </> : mode === "drawn" ? <>
          <p className="basis-note">{language === "ru" ? "Проведите по полю. Повторный проход по x меняет высоту графика." : "Проведіть по полю. Повторний прохід по x змінює висоту графіка."}</p>
          <BasisFunctionCanvas language={language} values={drawn.values} onChange={values => {
            markEdit(); setState(current => ({ ...current, drawn: { ...current.drawn, values } }));
          }} />
          {analysis && contribution && <BasisSignalPlot language={language} boundary={boundary} samples={samples}
            reconstruction={analysis.reconstruction} contribution={contribution} />}
        </> : <>
          <div className="basis-contour-controls">
            <label className="basis-check" title={canClose ? undefined : t.insufficient}>
              <input type="checkbox" data-basis-close checked={contour.closed} disabled={!canClose}
                onChange={(event) => replaceContour({ ...contour, closed: event.currentTarget.checked })} />{t.close}
            </label>
            <button type="button" title={t.square} data-basis-contour-example onClick={() => replaceContour({ kind: "contour", points: contourShape("square", 4), closed: true })}>{t.square}</button>
            <button type="button" title={t.clear} data-basis-clear disabled={!contour.points.length}
              onClick={() => replaceContour({ kind: "contour", points: [], closed: false })}>{t.clear}</button>
            <button type="button" title={t.undo} data-basis-undo disabled={!history.length} onClick={undoContour}>{t.undo}</button>
          </div>
          <p className="basis-note">{t.drawHelp}</p>
          <BasisContourCanvas language={language} points={contour.points} closed={contour.closed} reconstruction={analysis?.reconstruction}
            contribution={contribution} onDraftStart={markEdit} onDraw={(points) => replaceContour({ kind: "contour", points, closed: false })} />
          {!contour.points.length && <p className="basis-note">{t.empty}</p>}
        </>}
      </section>

      <section className="basis-card basis-settings">
        <h2>{t.settings}</h2>
        <label className="basis-field"><span>{t.basis}</span>
          <select data-basis-selector value={settings.basis}
            onChange={(event) => changeSettings({ basis: event.currentTarget.value as ExperimentBasisId }, true)}>
            {experimentBasisIds.map((basis) => <option value={basis} key={basis}>{t.names[basis]}</option>)}
          </select>
        </label>
        <div className="basis-setting-pair">
          <label className="basis-field"><span>{t.samples}</span>
            <select data-basis-samples value={settings.sampleCount} onChange={(event) => changeSettings({ sampleCount: Number(event.currentTarget.value) }, true)}>
              {experimentSampleCounts.map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          {waveletBases.has(settings.basis) && <label className="basis-field"><span>{t.level}</span>
            <select data-basis-level value={settings.level} onChange={(event) => changeSettings({ level: Number(event.currentTarget.value) }, true)}>
              {Array.from({ length: Math.log2(settings.sampleCount) }, (_, index) => index + 1)
                .map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>}
        </div>
        <label className="basis-field basis-count"><span>{t.count}<span className="basis-count-value" aria-hidden="true">{settings.count}</span></span>
          <input data-basis-count type="range" min="1" max={basisTermLimit(settings.basis, settings.sampleCount)} value={settings.count}
            onChange={(event) => changeSettings({ count: event.currentTarget.valueAsNumber })} />
        </label>
        <p className="basis-note">{convention}</p>
        {boundary === "open" && (settings.basis === "fourier" || waveletBases.has(settings.basis)) && <p className="basis-note">{t.seam}</p>}
        {analysis && <div className="basis-metrics" data-basis-analysis data-basis={settings.basis} data-rms={analysis.rms}
          data-max={analysis.max} data-count={analysis.terms.filter(({ active }) => active).length}>
          <div><span>{t.rms}</span><strong>{format(analysis.rms)}</strong></div>
          <div><span>{t.max}</span><strong>{format(analysis.max)}</strong></div>
        </div>}
        {error && (mode !== "signal" || error !== "invalid-expression") && <p className="basis-error" role="alert" data-basis-error={error}>{t.errors[error]}</p>}
        {notice && "loaded" in notice && <p className="basis-note" role="status" data-basis-imported>{t.loaded}</p>}
      </section>
    </div>

    {analysis && term && <div className="basis-detail-grid">
      <section className="basis-card">
        <h2>{t.coefficients}</h2>
        <label className="basis-field basis-term"><span>{t.term}</span>
          <select data-basis-contribution value={term.index} onChange={(event) => setTermIndex(Number(event.currentTarget.value))}>
            {analysis.terms.map((row) => <option key={row.index} value={row.index}>{row.label} · {row.active ? t.active : t.inactive}</option>)}
          </select>
        </label>
        <div className="basis-table-scroll" tabIndex={0} role="region" aria-label={t.coefficients}>
          <table><thead><tr><th scope="col">{t.coefficient}</th><th scope="col">Re</th><th scope="col">Im</th><th scope="col">|c|</th></tr></thead>
            <tbody>{analysis.terms.map((row) => <tr key={row.index} data-basis-coefficient={row.index} data-label={row.label}
              data-re={row.re} data-im={row.im} data-frequency={row.frequency} data-active={row.active}
              className={row.index === term.index ? "basis-selected-row" : undefined}>
              <th scope="row"><span className="basis-term-dot" title={row.active ? t.active : t.inactive} aria-hidden="true" />{row.label}</th>
              <td>{format(row.re)}</td><td>{format(row.im)}</td><td>{format(row.amplitude)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="basis-card" data-basis-comparison>
        <h2>{t.comparison}</h2>
        <p className="basis-note">{t.budget} · K = {budget}</p>
        <table><thead><tr><th scope="col">{t.basis}</th><th scope="col">RMS</th><th scope="col">Max</th></tr></thead>
          <tbody>{comparison.map(({ basis, rms, max }) => <tr key={basis} data-basis-comparison-row={basis} data-rms={rms} data-max={max}
            data-count={budget} className={basis === settings.basis ? "basis-selected-row" : undefined}>
            <th scope="row"><button type="button" title={t.names[basis]} aria-pressed={basis === settings.basis}
              onClick={() => changeSettings({ basis }, true)}>{t.names[basis]}</button></th>
            <td>{format(rms)}</td><td>{format(max)}</td>
          </tr>)}</tbody>
        </table>
      </section>
      {settings.basis === "fourier" && <BasisEpicycles language={language} analysis={analysis} boundary={boundary} sampleCount={samples.length} />}
    </div>}
    {analysis && <section className="basis-card"><h2>{language === "ru" ? "Спектр коэффициентов" : "Спектр коефіцієнтів"}</h2>
      <EngineeringPlot compact kind="stem" language={language} label="|cₖ|" showLegend={false} plot={{
        xLabel: "k, 1", yLabel: "|cₖ|, 1", yMin: 0, yMax: Math.max(.01, ...analysis.terms.map(t => t.amplitude)),
        xMin: Math.min(0, ...analysis.terms.map(t => t.frequency ?? t.index)), xMax: Math.max(1, ...analysis.terms.map(t => t.frequency ?? t.index)), curves: [{ label: "|cₖ|", color: "blue",
          points: analysis.terms.map(term => [term.frequency ?? term.index, term.amplitude] as const).sort((a,b) => a[0]-b[0]) }],
      }} />
    </section>}
    {samples.length > 0 && <details className="basis-card" onToggle={e => setCustomOpen(e.currentTarget.open)}><summary>{language === "ru" ? "Пользовательский базис" : "Власний базис"}</summary>
      {customOpen && <CustomBasisExperiment samples={samples} language={language} />}
    </details>}
        <div className="basis-archive">
          <button type="button" title={t.save} data-basis-export disabled={!ready || !analysis} onClick={exportArchive}>{t.save}</button>
          <button type="button" title={t.load} disabled={!ready} onClick={() => importFile.current?.click()}>{t.load}</button>
          <input ref={importFile} hidden data-basis-import type="file" accept="application/json,.json" onChange={importArchive} />
        </div>
    </fieldset>
  </section>;
}
