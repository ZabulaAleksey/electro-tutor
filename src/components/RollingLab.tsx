import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import {
  readRollingArchive, rollingArchiveMaxBytes, rollingPreset, writeRollingArchive, writeRollingObj,
  type Point2, type RollingInput, type RollingRequest, type RollingResponse, type RollingRun,
} from "../rolling/lab-model";
import type { Language } from "../types";
import { RollingComparison, RollingDrawing } from "./RollingLabGraphics";
import RollingViewport from "./RollingViewport";
import "./RollingLab.css";

const copy = {
  ru: {
    input: "Заданный след", draw: "Поле для рисования открытого следа", hint: "Нарисуйте открытый след одним штрихом или выберите пример.",
    arc: "Дуга E10", "s-bend": "S-образный след", clear: "Очистить",
    radius: "Радиус тела, м", quality: "Детализация", compact: "Компактная", full: "Полная",
    simulation: "Качение", play: "Пуск", pause: "Пауза", stop: "Стоп", cancel: "Отменить расчёт",
    time: "Время", seconds: "с", speed: "Скорость, м/с",
    trace: "Подготовка следа", solve: "Расчёт поз", verify: "Проверка опоры", mesh: "Построение сетки",
    cancelled: "Расчёт отменён.", import: "Открыть JSON", exportJson: "Сохранить JSON", exportObj: "Скачать OBJ",
    results: "Проверка контакта", traceError: "Ошибка следа / радиус", slipError: "Остаток скорости / скорость",
    gap: "Мин. просвет / радиус", poses: "Позы", triangles: "Треугольники",
    plot: "Сравнение следов точки контакта", requested: "Рисунок", target: "Расчётный след", actual: "Прямой расчёт",
    model: "Тело движется по расчётным позам. OBJ содержит приближённую поверхность в метрах.",
    errors: {
      EMPTY_TRACE: "Нарисуйте след или выберите пример.", DEGENERATE_TRACE: "След слишком короткий или почти замкнут.",
      TRACE_REVERSAL: "На следе есть резкий разворот. Для расчёта нужна более плавная линия.",
      TRACE_COMPLEXITY: "На следе слишком много поворотов. Упростите рисунок.",
      INVALID_INPUT: "Проверьте точки следа и радиус.", INVALID_ARCHIVE: "Файл не соответствует формату опыта G.",
      ARCHIVE_LIMIT: "Размер JSON превышает 64 КиБ.", BUDGET_EXCEEDED: "След выходит за пределы расчёта при этом радиусе.",
      NO_CERTIFIED_SHAPE: "Для этого следа и радиуса не удалось подтвердить форму тела.",
      CONTACT_NOT_CERTIFIED: "Проверка контакта обнаружила несовместимую форму или позу.",
      ROLLING_FAILED: "Расчёт не завершился. Попробуйте другой след или радиус.",
      WORKER_UNAVAILABLE: "Фоновый расчёт в этом браузере недоступен.",
    },
  },
  uk: {
    input: "Заданий слід", draw: "Поле для малювання відкритого сліду", hint: "Намалюйте відкритий слід одним штрихом або виберіть приклад.",
    arc: "Дуга E10", "s-bend": "S-подібний слід", clear: "Очистити",
    radius: "Радіус тіла, м", quality: "Деталізація", compact: "Компактна", full: "Повна",
    simulation: "Кочення", play: "Пуск", pause: "Пауза", stop: "Стоп", cancel: "Скасувати розрахунок",
    time: "Час", seconds: "с", speed: "Швидкість, м/с",
    trace: "Підготовка сліду", solve: "Розрахунок поз", verify: "Перевірка опори", mesh: "Побудова сітки",
    cancelled: "Розрахунок скасовано.", import: "Відкрити JSON", exportJson: "Зберегти JSON", exportObj: "Завантажити OBJ",
    results: "Перевірка контакту", traceError: "Похибка сліду / радіус", slipError: "Залишок швидкості / швидкість",
    gap: "Мін. просвіт / радіус", poses: "Пози", triangles: "Трикутники",
    plot: "Порівняння слідів точки контакту", requested: "Малюнок", target: "Розрахунковий слід", actual: "Прямий розрахунок",
    model: "Тіло рухається за розрахунковими позами. OBJ містить наближену поверхню в метрах.",
    errors: {
      EMPTY_TRACE: "Намалюйте слід або виберіть приклад.", DEGENERATE_TRACE: "Слід надто короткий або майже замкнутий.",
      TRACE_REVERSAL: "На сліді є різкий розворот. Для розрахунку потрібна плавніша лінія.",
      TRACE_COMPLEXITY: "На сліді забагато поворотів. Спростіть малюнок.",
      INVALID_INPUT: "Перевірте точки сліду та радіус.", INVALID_ARCHIVE: "Файл не відповідає формату досліду G.",
      ARCHIVE_LIMIT: "Розмір JSON перевищує 64 КіБ.", BUDGET_EXCEEDED: "Слід виходить за межі розрахунку з цим радіусом.",
      NO_CERTIFIED_SHAPE: "Для цього сліду та радіуса не вдалося підтвердити форму тіла.",
      CONTACT_NOT_CERTIFIED: "Перевірка контакту виявила несумісну форму або позу.",
      ROLLING_FAILED: "Розрахунок не завершився. Спробуйте інший слід або радіус.",
      WORKER_UNAVAILABLE: "Фоновий розрахунок у цьому браузері недоступний.",
    },
  },
};

type Diagnostic = keyof typeof copy.ru.errors;
type Progress = Extract<RollingResponse, { type: "progress" }>;
const initialInput: RollingInput = { trace: { kind: "preset", preset: "arc" }, radius: 1, quality: "full" };

function diagnostic(code: unknown, fallback: Diagnostic): Diagnostic {
  return typeof code === "string" && Object.hasOwn(copy.ru.errors, code) ? code as Diagnostic : fallback;
}

function nearestPose(run: RollingRun, fraction: number) {
  const target = fraction * run.poses.at(-1)!.s;
  let lo = 0, hi = run.poses.length - 1;
  while (hi - lo > 1) {
    const middle = Math.floor((lo + hi) / 2);
    if (run.poses[middle].s < target) lo = middle;
    else hi = middle;
  }
  return target - run.poses[lo].s <= run.poses[hi].s - target ? lo : hi;
}

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const element = document.createElement("a");
  element.href = url;
  element.download = name;
  document.body.append(element);
  element.click();
  element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RollingLab({ language }: { language: Language }) {
  const t = copy[language];
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState(initialInput);
  const [run, setRun] = useState<RollingRun | null>(null);
  const [speed, setSpeed] = useState(.75);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const inputTicket = useRef(0);
  const playbackTicket = useRef(0);
  const positionRef = useRef(0);
  const importer = useRef<HTMLInputElement>(null);

  const points = useMemo(() => input.trace.kind === "preset" ? rollingPreset(input.trace.preset) : input.trace.points, [input.trace]);
  const clock = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }), [language]);
  const source = input.trace.kind === "preset" ? input.trace.preset : "stroke";
  const duration = run ? run.poses.at(-1)!.s / speed : 0;
  const index = run ? nearestPose(run, position) : 0;
  const move = useCallback((fraction: number) => {
    positionRef.current = fraction;
    setPosition(fraction);
  }, []);
  const playback = useCallback((active: boolean) => {
    playbackTicket.current++;
    setPlaying(active);
  }, []);

  useEffect(() => {
    const invalidateImports = () => { inputTicket.current++; };
    if (matchMedia("(max-width: 650px), (pointer: coarse)").matches) {
      setInput(current => ({ ...current, quality: "compact" }));
    }
    setReady(true);
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      invalidateImports();
    };
  }, []);

  useEffect(() => {
    if (!playing || duration <= 0) return;
    const ticket = playbackTicket.current;
    let frame = 0, previous: number | undefined;
    function advance(time: number) {
      if (playbackTicket.current !== ticket) return;
      if (!document.hidden && previous !== undefined) {
        const seconds = Math.min(.10, (time - previous) / 1000);
        const next = Math.min(1, positionRef.current + seconds / duration);
        move(next);
        if (next >= 1) { playback(false); return; }
      }
      previous = time;
      frame = requestAnimationFrame(advance);
    }
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, move, playback]);

  const cancelWorker = useCallback(() => {
    requestId.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setProgress(null);
  }, []);

  const invalidateRun = useCallback(() => {
    inputTicket.current++;
    cancelWorker();
    setRun(null);
    playback(false);
    setCancelled(false);
    setError(null);
    move(0);
  }, [cancelWorker, move, playback]);

  const drawTrace = useCallback((stroke: Point2[]) => {
    invalidateRun();
    setInput(current => ({ ...current, trace: { kind: "stroke", points: stroke } }));
    if (stroke.length < 2) setError("DEGENERATE_TRACE");
  }, [invalidateRun]);

  function update(next: RollingInput) {
    invalidateRun();
    setInput(next);
  }

  function start() {
    if (!ready || workerRef.current) return;
    setCancelled(false);
    setError(null);
    if (run) {
      if (positionRef.current >= 1) move(0);
      playback(true);
      return;
    }
    if (points.length < 2) { setError("EMPTY_TRACE"); return; }
    let worker: Worker;
    try {
      worker = new Worker(new URL("../rolling/rolling.worker.ts", import.meta.url), { type: "module" });
    } catch {
      setError("WORKER_UNAVAILABLE");
      return;
    }
    const id = ++requestId.current;
    workerRef.current = worker;
    const active = () => workerRef.current === worker && requestId.current === id;
    setProgress({ id, type: "progress", phase: "trace", progress: 0 });
    worker.addEventListener("message", (event: MessageEvent<RollingResponse>) => {
      const message = event.data;
      if (!active() || message.id !== id) return;
      if (message.type === "progress") { setProgress(message); return; }
      cancelWorker();
      if (message.type === "error") { setError(diagnostic(message.code, "ROLLING_FAILED")); return; }
      setRun(message.run);
      if (positionRef.current >= 1) move(0);
      playback(true);
    });
    function workerError(event: Event) {
      event.preventDefault();
      if (!active()) return;
      cancelWorker();
      setError("WORKER_UNAVAILABLE");
    }
    worker.addEventListener("error", workerError);
    worker.addEventListener("messageerror", workerError);
    try {
      const request: RollingRequest = { id, input };
      worker.postMessage(request);
    } catch {
      workerError(new Event("error"));
    }
  }

  async function openArchive(event: ChangeEvent<HTMLInputElement>) {
    const control = event.currentTarget;
    const file = control.files?.[0];
    control.value = "";
    if (!file) return;
    const ticket = ++inputTicket.current;
    try {
      if (file.size > rollingArchiveMaxBytes) throw Error("ARCHIVE_LIMIT");
      const bytes = await file.arrayBuffer();
      if (inputTicket.current !== ticket) return;
      const archive = readRollingArchive(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      update(archive.input);
      setSpeed(archive.speed);
      move(archive.position);
    } catch (failure) {
      if (inputTicket.current === ticket) {
        setError(diagnostic(failure instanceof Error ? failure.message : undefined, "INVALID_ARCHIVE"));
      }
    }
  }

  const number = (value: number) => formatEngineeringNumber(value, language, { zeroTolerance: 1e-12, maximumFractionDigits: 6 });
  const timeLabel = `${clock.format(position * duration)} / ${clock.format(duration)} ${t.seconds}`;
  const triangles = run ? run.mesh.triangles.length / 3 : 0;
  const phaseLabel = progress ? t[progress.phase] : "";
  return <div className="rolling-lab" data-rolling-lab data-ready={ready} data-position={position} data-source={source}>
    <section className="rolling-card rolling-input">
      <h2>{t.input}</h2>
      <p className="rolling-hint">{t.hint}</p>
      <div className="rolling-actions">
        {(["arc", "s-bend"] as const).map(preset => <button key={preset} type="button" data-rolling-preset={preset}
          aria-pressed={source === preset} onClick={() => update({ ...input, trace: { kind: "preset", preset } })}>
          {t[preset]}
        </button>)}
        <button type="button" onClick={() => update({ ...input, trace: { kind: "stroke", points: [] } })}>{t.clear}</button>
      </div>
      <RollingDrawing label={t.draw} points={points} onStart={invalidateRun} onDraw={drawTrace} />
      <div className="rolling-fields">
        <label className="rolling-field">
          <span>{t.radius} <output>{number(input.radius)}</output></span>
          <input type="range" min=".25" max="2" step=".01" value={input.radius} data-rolling-radius
            onChange={event => update({ ...input, radius: Number(event.currentTarget.value) })} />
        </label>
        <label className="rolling-field">
          <span>{t.quality}</span>
          <select value={input.quality} data-rolling-quality onChange={event =>
            update({ ...input, quality: event.currentTarget.value === "compact" ? "compact" : "full" })
          }>
            <option value="compact">{t.compact}</option><option value="full">{t.full}</option>
          </select>
        </label>
      </div>
      <div className="rolling-actions">
        <button type="button" onClick={() => importer.current?.click()}>{t.import}</button>
        <input hidden ref={importer} type="file" accept=".json,application/json" data-rolling-import onChange={event => void openArchive(event)} />
        <button type="button" disabled={points.length < 2} data-rolling-export-json onClick={() =>
          download("electrotutor-rolling.json", writeRollingArchive(input, speed, positionRef.current), "application/json")
        }>{t.exportJson}</button>
      </div>
    </section>

    <section className="rolling-card rolling-simulation">
      <h2>{t.simulation}</h2>
      <div className="rolling-actions rolling-playback">
        <button className="rolling-primary" type="button" data-rolling-play disabled={!ready || !!progress || playing} onClick={start}>{t.play}</button>
        <button type="button" data-rolling-pause disabled={!playing} onClick={() => playback(false)}>{t.pause}</button>
        <button type="button" data-rolling-stop disabled={!run} onClick={() => { playback(false); move(0); }}>{t.stop}</button>
        {progress && <button type="button" data-rolling-cancel onClick={() => { cancelWorker(); setCancelled(true); }}>{t.cancel}</button>}
        <button type="button" data-rolling-export-obj disabled={!run} onClick={() =>
          run && download("electrotutor-rolling.obj", writeRollingObj(run.mesh), "text/plain")
        }>{t.exportObj}</button>
      </div>
      {progress && <div className="rolling-progress" role="status" data-rolling-progress>
        <span>{phaseLabel}</span><progress value={progress.progress} max={1} aria-label={phaseLabel} />
      </div>}
      {cancelled && <p role="status" className="rolling-hint">{t.cancelled}</p>}
      {error && <p role="alert" data-rolling-error={error} className="rolling-error">{t.errors[error]}</p>}
      <RollingViewport language={language} run={run} poseIndex={index} quality={input.quality} />
      <div className="rolling-fields">
        <label className="rolling-field">
          <span>{t.time} <span className="rolling-field-value" aria-hidden="true">{timeLabel}</span></span>
          <input type="range" min="0" max="1" step=".001" value={position} disabled={!run}
            aria-label={t.time} aria-valuetext={timeLabel}
            data-rolling-time onChange={event => { playback(false); move(Number(event.currentTarget.value)); }} />
        </label>
        <label className="rolling-field">
          <span>{t.speed} <output>{number(speed)}</output></span>
          <input type="range" min=".25" max="4" step=".05" value={speed}
            onChange={event => setSpeed(Number(event.currentTarget.value))} />
        </label>
      </div>
    </section>

    {run && <section className="rolling-card rolling-results" data-rolling-analysis data-trace={source}
      data-trace-error={run.verification.maxTraceOverRadius} data-slip-error={run.verification.maxSlipOverSpeed}
      data-gap={run.verification.minGapOverRadius} data-triangles={triangles}>
      <h2>{t.results}</h2>
      <dl className="rolling-metrics">
        <div><dt>{t.traceError}</dt><dd>{number(run.verification.maxTraceOverRadius)}</dd></div>
        <div><dt>{t.slipError}</dt><dd>{number(run.verification.maxSlipOverSpeed)}</dd></div>
        <div><dt>{t.gap}</dt><dd>{number(run.verification.minGapOverRadius)}</dd></div>
        <div><dt>{t.poses}</dt><dd>{run.poses.length}</dd></div>
        <div><dt>{t.triangles}</dt><dd>{triangles}</dd></div>
      </dl>
      <RollingComparison run={run} index={index} labels={t} />
      <p className="rolling-hint">{t.model}</p>
    </section>}
  </div>;
}
