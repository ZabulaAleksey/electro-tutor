import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { formatEngineeringNumber } from "../engineering/format";
import type { Complex } from "../fourier/math";
import { motionJsonMaxBytes, motionMaxComponents, motionMaxScale, motionSampleCount, motionShapes, motionSvgMaxBytes,
  type MotionFamily, type MotionOptions, type PolygonMotion, type PolygonMotionExperiment } from "../fourier/polygon-motion-contract";
import { checkedMotionPoints, defaultPolygonExperiment, motionPresetPoints, readPolygonExperiment, writePolygonExperiment } from "../fourier/polygon-motion-input";
import { evaluatePolygonMotion, fitPolygonMotion } from "../fourier/polygon-motion-math";
import { readPolygonSvg } from "../fourier/polygon-motion-svg";
import type { Language } from "../types";
import { BasisContourCanvas } from "./BasisExperimentGraphics";
import { PolygonMotionPlayback } from "./PolygonMotionGraphics";
import "./BasisExperimentLab.css";
import "./PolygonMotionLab.css";

const copy = {
  ru: {
    title: "Исходный контур", shape: "Семейство движений", preset: "Примеры", star: "Звезда",
    draw: "Нарисуйте контур одним штрихом. Конец соединяется с началом.",
    undo: "Отменить ввод", clear: "Очистить", openSvg: "Открыть SVG", openJson: "Открыть JSON", save: "Сохранить JSON",
    settings: "Подбор движений", count: "Лимит компонент", components: "Подобрано компонент", sides: "Стороны n-угольника",
    aspect: "Ширина / высота прямоугольника", rms: "Ошибка RMS", max: "Ошибка Max", chosen: "Выбранная компонента",
    scale: "Масштаб", angle: "Угол поворота, °", shift: "Сдвиг фазы, отсчёты", direction: "Направление обхода",
    clockwise: "По часовой стрелке", counterclockwise: "Против часовой стрелки", auto: "Восстановить автоподбор",
    samples: "128 отсчётов по длине дуги", empty: "Нарисуйте контур или откройте пример, чтобы увидеть движения.",
    phaseDegrees: "Фазовый сдвиг", manual: "Используются заданные коэффициенты.",
    names: { all: "Все семейства", triangle: "Треугольник", square: "Квадрат", rectangle: "Прямоугольник",
      polygon: "Правильный n-угольник", circle: "Окружность" },
    errors: {
      "invalid-contour": "Для контура нужны хотя бы три разные точки в поле рисования.",
      "unsupported-svg": "SVG должен содержать один замкнутый контур без ссылок, сценариев и преобразований.",
      "svg-limit": "Размер SVG превышает 128 КиБ.",
      "svg-complexity": "В кривом пути допускается до 64 команд. Упростите контур SVG.",
      "archive-limit": "Размер JSON превышает 512 КиБ.",
      "invalid-archive": "Проверьте формат архива, контур и коэффициенты.",
      "invalid-motion-options": "Параметры подбора выходят за допустимые границы.",
      "invalid-motion-component": "Проверьте масштаб, угол, фазу и направление компоненты.",
    },
  },
  uk: {
    title: "Початковий контур", shape: "Сімейство рухів", preset: "Приклади", star: "Зірка",
    draw: "Намалюйте контур одним штрихом. Кінець з’єднується з початком.",
    undo: "Скасувати введення", clear: "Очистити", openSvg: "Відкрити SVG", openJson: "Відкрити JSON", save: "Зберегти JSON",
    settings: "Підбір рухів", count: "Ліміт компонент", components: "Підібрано компонент", sides: "Сторони n-кутника",
    aspect: "Ширина / висота прямокутника", rms: "Похибка RMS", max: "Похибка Max", chosen: "Вибрана компонента",
    scale: "Масштаб", angle: "Кут повороту, °", shift: "Зсув фази, відліки", direction: "Напрямок обходу",
    clockwise: "За годинниковою стрілкою", counterclockwise: "Проти годинникової стрілки", auto: "Відновити автопідбір",
    samples: "128 відліків за довжиною дуги", empty: "Намалюйте контур або відкрийте приклад, щоб побачити рухи.",
    phaseDegrees: "Фазовий зсув", manual: "Використовуються задані коефіцієнти.",
    names: { all: "Усі сімейства", triangle: "Трикутник", square: "Квадрат", rectangle: "Прямокутник",
      polygon: "Правильний n-кутник", circle: "Коло" },
    errors: {
      "invalid-contour": "Для контуру потрібні щонайменше три різні точки в полі малювання.",
      "unsupported-svg": "SVG має містити один замкнутий контур без посилань, сценаріїв і перетворень.",
      "svg-limit": "Розмір SVG перевищує 128 КіБ.",
      "svg-complexity": "У кривому шляху дозволено до 64 команд. Спростіть контур SVG.",
      "archive-limit": "Розмір JSON перевищує 512 КіБ.",
      "invalid-archive": "Перевірте формат архіву, контур і коефіцієнти.",
      "invalid-motion-options": "Параметри підбору виходять за допустимі межі.",
      "invalid-motion-component": "Перевірте масштаб, кут, фазу й напрямок компоненти.",
    },
  },
} as const;

type MotionError = keyof typeof copy.ru.errors;
type Workspace = { current: PolygonMotionExperiment; previous: PolygonMotionExperiment[] };
type FieldName = "sides" | "aspect" | "scale" | "angle" | "shift";
const presets = ["square", "circle", "star"] as const;
const families = ["all", ...motionShapes] as const;

function localizedError(error: unknown, fallback: MotionError): MotionError {
  return error instanceof Error && Object.hasOwn(copy.ru.errors, error.message) ? error.message as MotionError : fallback;
}

function NumericControl({ name, label, value, min, max, step, onChange }: {
  name: FieldName;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number | "any";
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const marker = { [`data-motion-${name}`]: true };
  return <label className="motion-field"><span>{label}</span>
    <input {...marker} type="number" min={min} max={max} step={step} value={draft ?? String(Number(value.toFixed(7)))}
      aria-invalid={draft !== null ? true : undefined} onBlur={() => setDraft(null)}
      onChange={event => {
        const input = event.currentTarget;
        const next = input.valueAsNumber;
        if (!Number.isFinite(next) || next < min || next > max || (step === 1 && !Number.isInteger(next))) {
          setDraft(input.value);
          return;
        }
        setDraft(null);
        onChange(next);
      }} />
  </label>;
}

export default function PolygonMotionLab({ language }: { language: Language }) {
  const t = copy[language];
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => ({ current: defaultPolygonExperiment(), previous: [] }));
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<MotionError | null>(null);
  const svgInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const generation = useRef({ ticket: 0 });
  useEffect(() => {
    setReady(true);
    const imports = generation.current;
    return () => { imports.ticket++; };
  }, []);

  const { current, previous } = workspace;
  const { points, options, components } = current;
  const calculation = useMemo(() => {
    if (!ready || !points.length) return {};
    try {
      return { result: components ? evaluatePolygonMotion(points, options, components.slice(0, options.count)) : fitPolygonMotion(points, options) };
    } catch (failure) {
      return { problem: localizedError(failure, "invalid-motion-options") };
    }
  }, [ready, points, options, components]);
  const { result, problem } = calculation;
  const notice = error ?? problem;
  const active = Math.max(0, Math.min(selected, (result?.components.length ?? 0) - 1));
  const component = result?.components[active];

  function markEdit() {
    generation.current.ticket++;
    setError(null);
  }

  function replace(next: PolygonMotionExperiment) {
    markEdit();
    setSelected(0);
    setWorkspace(state => ({ current: next, previous: [...state.previous.slice(-11), state.current] }));
  }

  function setPoints(next: Complex[]) {
    replace({ ...current, points: next, components: undefined });
  }

  function undo() {
    const last = previous[previous.length - 1];
    if (!last) return;
    markEdit();
    setSelected(0);
    setWorkspace({ current: last, previous: previous.slice(0, -1) });
  }

  function changeOptions(update: Partial<MotionOptions>) {
    markEdit();
    const next = { ...options, ...update };
    let manual: PolygonMotion[] | undefined;
    if (components && update.count !== undefined) {
      manual = next.count > components.length ? fitPolygonMotion(points, next, components).components : components;
    }
    setWorkspace(state => ({ ...state, current: { ...state.current, options: next, components: manual } }));
  }

  function editComponent(update: Partial<PolygonMotion>) {
    if (!component || !result) return;
    markEdit();
    const next = (components ?? result.components).map((entry, index) => index === active ? { ...entry, ...update } : entry);
    setWorkspace(state => ({ ...state, current: { ...state.current, components: next } }));
  }

  function autoFit() {
    markEdit();
    setWorkspace(state => ({ ...state, current: { ...state.current, components: undefined } }));
  }

  function draw(stroke: Complex[]) {
    try { setPoints(checkedMotionPoints(stroke)); }
    catch (failure) { setError(localizedError(failure, "invalid-contour")); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>, kind: "svg" | "json") {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const ticket = ++generation.current.ticket;
    setError(null);
    try {
      if (file.size > (kind === "svg" ? motionSvgMaxBytes : motionJsonMaxBytes)) {
        throw Error(kind === "svg" ? "svg-limit" : "archive-limit");
      }
      const raw = await file.text();
      if (generation.current.ticket !== ticket) return;
      if (kind === "svg") setPoints(readPolygonSvg(raw));
      else replace(readPolygonExperiment(raw));
    } catch (failure) {
      if (generation.current.ticket === ticket) setError(localizedError(failure, kind === "svg" ? "unsupported-svg" : "invalid-archive"));
    }
  }

  function exportArchive() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([writePolygonExperiment(current, result)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "electrotutor-polygon-motion.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="polygon-motion-lab" data-motion-lab data-ready={ready}>
    <div className="motion-workspace">
      <section className="motion-card" aria-label={t.title}>
        <h2>{t.title}</h2>
        <div className="motion-actions" aria-label={t.preset} role="group">
          {presets.map(preset => <button type="button" key={preset} data-motion-preset={preset}
            onClick={() => setPoints(motionPresetPoints(preset))}>{preset === "star" ? t.star : t.names[preset]}</button>)}
        </div>
        <p className="motion-note">{t.draw}</p>
        <div data-motion-source-drawing>
          <BasisContourCanvas language={language} points={points} closed reconstruction={result?.reconstruction}
            contribution={result?.contributions[active]} onDraftStart={markEdit} onDraw={draw} />
        </div>
        <div className="motion-actions">
          <button type="button" data-motion-undo disabled={!previous.length} onClick={undo}>{t.undo}</button>
          <button type="button" data-motion-clear disabled={!points.length} onClick={() => setPoints([])}>{t.clear}</button>
          <button type="button" onClick={() => svgInput.current?.click()}>{t.openSvg}</button>
          <button type="button" onClick={() => jsonInput.current?.click()}>{t.openJson}</button>
          <button type="button" data-motion-export disabled={!result} onClick={exportArchive}>{t.save}</button>
        </div>
        <input type="file" hidden ref={svgInput} accept="image/svg+xml,.svg" data-motion-svg-import onChange={event => void importFile(event, "svg")} />
        <input type="file" hidden ref={jsonInput} accept="application/json,.json" data-motion-json-import onChange={event => void importFile(event, "json")} />
        {notice && <p role="alert" className="motion-error" data-motion-error={notice}>{t.errors[notice]}</p>}
      </section>

      {result ? <PolygonMotionPlayback language={language} points={points} result={result} options={options} selected={active} /> :
        ready && <div className="motion-card motion-note">{t.empty}</div>}
    </div>

    <div className="motion-workspace">
      <section className="motion-card" aria-label={t.settings}>
        <h2>{t.settings}</h2>
        <label className="motion-field"><span>{t.shape}</span>
          <select data-motion-family value={options.family} onChange={event => changeOptions({ family: event.currentTarget.value as MotionFamily })}>
            {families.map(family => <option key={family} value={family}>{t.names[family]}</option>)}
          </select>
        </label>
        <div className="motion-field-pair">
          {(options.family === "all" || options.family === "polygon") && <NumericControl name="sides" label={t.sides} value={options.sides}
            min={3} max={12} step={1} onChange={sides => changeOptions({ sides })} />}
          {(options.family === "all" || options.family === "rectangle") && <NumericControl name="aspect" label={t.aspect} value={options.aspect}
            min={1.1} max={3} step="any" onChange={aspect => changeOptions({ aspect })} />}
        </div>
        <label className="motion-field motion-budget"><span>{t.count} <span className="motion-budget-value" aria-hidden="true">{options.count}</span></span>
          <input type="range" data-motion-count min="1" max={motionMaxComponents} step="1" value={options.count}
            onChange={event => changeOptions({ count: event.currentTarget.valueAsNumber })} />
        </label>
        <p className="motion-note">{t.samples}</p>
        {result && <dl className="motion-metrics" data-motion-analysis data-rms={result.rms} data-max={result.max}
          data-components={result.components.length}>
          <div><dt>{t.rms}</dt><dd>{formatEngineeringNumber(result.rms, language, { zeroTolerance: 1e-12 })}</dd></div>
          <div><dt>{t.max}</dt><dd>{formatEngineeringNumber(result.max, language, { zeroTolerance: 1e-12 })}</dd></div>
          <div><dt>{t.components}</dt><dd>{result.components.length}</dd></div>
        </dl>}
      </section>

      {result && component && <section className="motion-card" aria-label={t.chosen}>
        <h2>{t.chosen}</h2>
        <select aria-label={t.chosen} data-motion-component value={active} onChange={event => setSelected(Number(event.currentTarget.value))}>
          {result.components.map((entry, index) => <option key={index} value={index} data-motion-component-shape={entry.shape}>
            {index + 1}. {t.names[entry.shape]}
          </option>)}
        </select>
        <div className="motion-field-pair" key={active}>
          <NumericControl name="scale" label={t.scale} value={component.scale} min={0} max={motionMaxScale}
            step="any" onChange={scale => editComponent({ scale })} />
          <NumericControl name="angle" label={t.angle} value={component.angleDegrees} min={-180} max={180}
            step="any" onChange={angleDegrees => editComponent({ angleDegrees })} />
          <NumericControl name="shift" label={t.shift} value={component.phaseIndex} min={0} max={motionSampleCount - 1}
            step={1} onChange={phaseIndex => editComponent({ phaseIndex })} />
          <label className="motion-field"><span>{t.direction}</span>
            <select data-motion-direction value={component.direction} onChange={event => editComponent({ direction: event.currentTarget.value === "1" ? 1 : -1 })}>
              <option value="1">{t.counterclockwise}</option><option value="-1">{t.clockwise}</option>
            </select>
          </label>
        </div>
        <p className="motion-note">{t.phaseDegrees} {formatEngineeringNumber(component.phaseIndex * 360 / motionSampleCount, language)}°</p>
        {components && <div className="motion-actions">
          <button type="button" data-motion-autofit onClick={autoFit}>{t.auto}</button>
          <p className="motion-note">{t.manual}</p>
        </div>}
      </section>}
    </div>
  </div>;
}
