import { flushSync } from "react-dom";
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {useUnsavedChanges} from "../engineering/useUnsavedChanges";
import { usePointerStroke, svgPoint } from "../engineering/usePointerStroke";
import { useLocalZoom } from "../engineering/useLocalZoom";
import { zoomAt } from "../engineering/gestures";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { formatEngineeringNumber } from "../engineering/format";
import type { EngineeringPlotData } from "../engineering/plot";
import { Play, Pause, Square, Undo2, RotateCcw, StepForward, Eraser } from "lucide-react";
import ContourPresets, { type SignalPreset } from "./ContourPresets";
import { fourierDocumentSignature, MAX_CONFIG_AMPLITUDE, MAX_CONFIG_HARMONICS, MAX_CONFIG_PHASE, validateFourierConfig, type FourierConfig } from "../fourier/config";
import { dft, epicycleChain, resampleContour, orderCoefficients, reconstruct, reconstructionError, type Coefficient, type Complex } from "../fourier/math";

import {smoothContour} from "../fourier/contour";
import "./FourierLab.css";

type Language = "ru" | "uk";
type FourierOrder = "amplitude" | "frequency" | "interleaved";

const demo: Complex[] = Array.from({ length: 160 }, (_, i) => { const a = 2 * Math.PI * i / 160; const r = (1 + .18 * Math.cos(3 * a)) / 1.18; return { re: r * Math.cos(a), im: r * Math.sin(a) }; });
const text = {
  ru: { title: "Fourier Sketch", subtitle: "Контур → DFT → эпициклы и реконструкция", demo: "Демо-контур", clear: "Очистить", undo: "Отменить", play: "Пуск", pause: "Пауза", step: "Шаг", reset: "Сброс фазы", loop: "Зациклить", closed: "Замкнутый контур", draw: "Рисуйте мышью или стилусом", original: "Оригинал", reconstruction: "Реконструкция", vectors: "Эпициклы", trace: "След точки", harmonics: "Гармоники", speed: "Скорость", phase: "Фаза", order: "Порядок", amplitude: "Амплитуда", frequency: "Частота", interleaved: "Чередование", basis: "Базис", spectrum: "Спектр амплитуд", table: "Таблица гармоник", rms: "RMS ошибка", max: "Макс. ошибка", export: "CSV", save: "Сохранить", load: "Загрузить", zoom: "Масштаб", resetView: "Сброс вида", playground: "Готовые сигналы", preset: "Пресет", square: "Меандр", saw: "Пила", triangle: "Треугольник", beats: "Биения", signal: "Сигнал", time: "Время", signalValue: "Сигнал", gibbs: "Для ступенчатых сигналов виден эффект Гиббса.", importNote: "Импорт изображения не включён: контур строится локально без загрузки данных.", panHint: "Alt+перетаскивание — панорамирование, Ctrl + колесо — масштаб.", invalidConfig: "Конфигурация отклонена: повреждённые или небезопасные данные не применены." },
  uk: { title: "Fourier Sketch", subtitle: "Контур → DFT → епіцикли та реконструкція", demo: "Демо-контур", clear: "Очистити", undo: "Скасувати", play: "Пуск", pause: "Пауза", step: "Крок", reset: "Скинути фазу", loop: "Зациклити", closed: "Замкнений контур", draw: "Малюйте мишкою або стилусом", original: "Оригінал", reconstruction: "Реконструкція", vectors: "Епіцикли", trace: "Слід точки", harmonics: "Гармоніки", speed: "Швидкість", phase: "Фаза", order: "Порядок", amplitude: "Амплітуда", frequency: "Частота", interleaved: "Черговість", basis: "Базис", spectrum: "Спектр амплітуд", table: "Таблиця гармонік", rms: "RMS помилка", max: "Макс. помилка", export: "Експорт CSV", save: "Зберегти", load: "Завантажити", zoom: "Масштаб", resetView: "Скинути вигляд", playground: "Готові сигнали", preset: "Пресет", square: "Меандр", saw: "Пила", triangle: "Трикутник", beats: "Биття", signal: "Сигнал", time: "Час", signalValue: "Сигнал", gibbs: "Для ступінчастих сигналів видно ефект Гіббса.", importNote: "Імпорт зображень не ввімкнено: контур будується локально без завантаження даних.", panHint: "Alt+перетягування — панорамування, Ctrl + колесо — масштаб.", invalidConfig: "Конфігурацію відхилено: пошкоджені або небезпечні дані не застосовано." }
} as const;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const signalPreset = (name: string, n = 128, amplitude = 1, phase = 0): Complex[] => Array.from({ length: n }, (_, i) => { const q = i / n; const shifted = q + phase / (2 * Math.PI); const saw = 2 * (shifted - Math.floor(shifted + .5)); const value = name === "square" ? (Math.sin(2 * Math.PI * q + phase) >= 0 ? 1 : -1) : name === "saw" ? saw : name === "triangle" ? 2 * Math.abs(saw) - 1 : Math.sin(2 * Math.PI * q + phase) + .65 * Math.sin(2 * Math.PI * 1.07 * q + phase); return { re: 2 * q - 1, im: amplitude * value }; });
function CoefficientInput({ value, displayValue, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: number;
  displayValue?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input {...props} value={draft ?? displayValue ?? String(value)}
    onFocus={event => {
      if (displayValue === undefined) return;
      flushSync(() => setDraft(String(value)));
      event.currentTarget.select();
    }} onBlur={() => setDraft(null)}
    onChange={event => {
      const next = event.target.value;
      setDraft(next);
      const normalized = next.trim().replace(",", ".");
      if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) && Number.isFinite(Number(normalized))) {
        onChange(Number(normalized));
      }
    }}/>;
}

type SourceHistory = Pick<FourierConfig, "points" | "closed" | "enabled" | "edited" | "playground">;
export type FourierSession = {
  config: FourierConfig; history: SourceHistory[]; savedSignature: string; playing: boolean;
  showOriginal: boolean; showVectors: boolean; showTrace: boolean;
  zoom: number; pan: { x: number; y: number }; vertex: number;
};
export type FourierHandle = { snapshot: () => FourierSession };

export default function FourierLab({ language = "ru", initialPoints = demo, initialClosed = true, initialSignal, onSourceChange, session, ref }: {
  language?: Language; initialPoints?: Complex[]; initialClosed?: boolean; initialSignal?: SignalPreset;
  onSourceChange?: (points: Complex[], closed: boolean) => void;
  session?: FourierSession; ref?: React.Ref<FourierHandle>;
}) {
  const t = text[language];
  const restored = session?.config;
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [points, storePoints] = useState<Complex[]>(restored?.points ?? initialPoints);
  const [history, setHistory] = useState<SourceHistory[]>(session?.history ?? []);
  const [closed, setClosed] = useState(restored?.closed ?? (initialSignal ? false : initialClosed));
  const [count, setCount] = useState(restored?.count ?? 16);
  const [phase, setPhase] = useState(restored?.phase ?? 0);
  const [speed, setSpeed] = useState(restored?.speed ?? .08);
  const [playing, setPlaying] = useState(session?.playing ?? true);
  const [loop, setLoop] = useState(restored?.loop ?? true);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(session?.showOriginal ?? true);
  const [showVectors, setShowVectors] = useState(session?.showVectors ?? true);
  const [showTrace, setShowTrace] = useState(session?.showTrace ?? true);
  const [order, setOrder] = useState<FourierOrder>(restored?.order ?? "amplitude");
  const [enabled, setEnabled] = useState<FourierConfig["enabled"]>(restored?.enabled ?? {});
  const [edited, setEdited] = useState<FourierConfig["edited"]>(restored?.edited ?? {});
  const [zoom, setZoom] = useState(session?.zoom ?? 1);
  const [pan, setPan] = useState(session?.pan ?? { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false), [panning, setPanning] = useState(false);
  const [preset, setPreset] = useState<string>(restored?.playground?.preset ?? initialSignal ?? "square");
  const [playgroundAmplitude, setPlaygroundAmplitude] = useState(restored?.playground?.amplitude ?? 1);
  const [playgroundPhase, setPlaygroundPhase] = useState(restored?.playground?.phase ?? 0);
  const [playgroundActive, setPlaygroundActive] = useState(restored?.playground?.active ?? Boolean(initialSignal));
  const [configMessage, setConfigMessage] = useState("");
  const jsonInput = useRef<HTMLInputElement>(null);
  const importRevision = useRef({ sequence: 0 }).current;
  const svg = useRef<SVGSVGElement>(null), phaseRef = useRef(phase), panOrigin = useRef({ x: 0, y: 0 }), panStart = useRef({ x: 0, y: 0 });
  const preview = useRef<SVGPolylineElement>(null), drawing = useRef(false), resumeDrawing = useRef(false), panPointer=useRef<number|null>(null), visual=useRef<HTMLDivElement>(null);
  const [vertex,setVertex]=useState(session?.vertex ?? 0);
  const ru = language === "ru";
  const basis = "fourier";
  function setPoints(next: Complex[]) {
    storePoints(next); setEnabled({}); setEdited({});
  }
  const [fullscreen,setFullscreen]=useState(false);
  const documentState=useMemo(()=>({points,closed,enabled,edited,playground:{active:playgroundActive,preset:preset as "square"|"saw"|"triangle"|"beats",amplitude:playgroundAmplitude,phase:playgroundPhase}}),[points,closed,enabled,edited,playgroundActive,preset,playgroundAmplitude,playgroundPhase]);
  const signature=useMemo(()=>fourierDocumentSignature(documentState),[documentState]),[savedSignature,setSavedSignature]=useState(session?.savedSignature ?? signature);
  useEffect(() => {
    importRevision.sequence++;
    return () => { importRevision.sequence++; };
  }, [signature, count, speed, loop, order, importRevision]);
  function config(): FourierConfig { return { ...documentState, count, phase, speed, loop, basis, order }; }
  useImperativeHandle(ref, () => ({
    snapshot: () => ({ config: config(), history, savedSignature, playing, showOriginal, showVectors, showTrace, zoom, pan, vertex }),
  }));
  const playgroundSamples = useMemo(() => signalPreset(preset, 128, playgroundAmplitude, playgroundPhase), [preset, playgroundAmplitude, playgroundPhase]);
  const samples = useMemo(() => playgroundActive ? playgroundSamples.map(({im}) => ({ re: im, im: 0 })) : resampleContour(points, 128, closed), [points, closed, playgroundActive, playgroundSamples]);
  useEffect(() => {
    onSourceChange?.(playgroundActive ? playgroundSamples : points, !playgroundActive && closed);
  }, [onSourceChange, points, closed, playgroundActive, playgroundSamples]);
  const fourierAll = useMemo(() => orderCoefficients(dft(samples), order).map((c) => { const e = edited[c.k]; return e ? { ...c, re: e.amplitude * Math.cos(e.phase), im: e.amplitude * Math.sin(e.phase), amplitude: e.amplitude, phase: e.phase } : c; }), [samples, order, edited]);
  const centeringTolerance = useMemo(() => {
    if (playgroundActive || !samples.length) return 0;
    const scale = Math.max(1, ...samples.map(({ re, im }) => Math.hypot(re, im)));
    // Suppress only DFT summation noise in the displayed DC amplitude.
    return 4 * samples.length * Number.EPSILON * scale;
  }, [playgroundActive, samples]);
  const isCenteringNoise = (coefficient: Coefficient) =>
    !playgroundActive && coefficient.k === 0 && !edited[0] && coefficient.amplitude <= centeringTolerance;
  const amplitudeLabel = (coefficient: Coefficient) =>
    formatEngineeringNumber(isCenteringNoise(coefficient) ? 0 : coefficient.amplitude, language);
  const fourierCoefficients = useMemo(() => fourierAll.slice(0, count).filter((c) => enabled[c.k] !== false), [fourierAll, count, enabled]);
  const chain = useMemo(() => epicycleChain(fourierCoefficients, phase), [fourierCoefficients, phase]);
  const error = useMemo(() => reconstructionError(samples, fourierCoefficients), [samples, fourierCoefficients]);
  const endpoint = reconstruct(fourierCoefficients, phase);
  useEffect(() => { const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)"); const update = () => setMotionAllowed(!document.hidden && !reduced?.matches); update(); reduced?.addEventListener?.("change", update); document.addEventListener("visibilitychange", update); return () => { reduced?.removeEventListener?.("change", update); document.removeEventListener("visibilitychange", update); }; }, []);
  function seek(next: number) {
    phaseRef.current = next;
    setPhase(next);
  }
  useEffect(() => {
    if (!playing || !motionAllowed) return;
    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      const current = phaseRef.current + Math.max(0, now - (last ?? now)) / 1000 * speed;
      last = now;
      seek(loop ? current % 1 : Math.min(current, 1));
      if (loop || current < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, motionAllowed, speed, loop]);
  const vertexIndex=Math.min(vertex,points.length-1);
  const currentVertex=points[vertexIndex];
  const pushHistory = () => setHistory((items) => [...items.slice(-19),documentState]);
  const stroke = usePointerStroke({ svgRef:svg, previewRef:preview,
    toPoint:event=>svg.current?svgPoint(svg.current,event.clientX,event.clientY):{x:0,y:0},
    onStart:()=>{drawing.current=true;resumeDrawing.current=playing;setPlaying(false);setDragging(true);},
    onCommit:draft=>{pushHistory();setPlaygroundActive(false);setPoints(draft.map(p=>({re:((p.x-260)/170-pan.x)/zoom,im:((190-p.y)/170-pan.y)/zoom})));},
    onFinish:()=>{drawing.current=false;setDragging(false);if(resumeDrawing.current)setPlaying(true);},
  });
  const changeZoom=(anchor:{x:number;y:number},factor:number)=>{if(drawing.current)return;const value=zoomAt(zoom,{x:pan.x*170,y:-pan.y*170},anchor,{x:260,y:190},factor);setZoom(value.zoom);setPan({x:value.pan.x/170,y:-value.pan.y/170});};
  useLocalZoom(svg,changeZoom);
  const pointerDown=(event:React.PointerEvent<SVGSVGElement>)=>{if(drawing.current)return;if(event.pointerType!=="touch"&&(event.button===1||event.altKey)){if(panPointer.current!==null)return;panPointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);setPanning(true);panOrigin.current=pan;panStart.current=svgPoint(event.currentTarget,event.clientX,event.clientY);return;}stroke.onPointerDown(event);};
  const pointerMove=(event:React.PointerEvent<SVGSVGElement>)=>{if(panPointer.current===event.pointerId){const point=svgPoint(event.currentTarget,event.clientX,event.clientY);setPan({x:panOrigin.current.x+(point.x-panStart.current.x)/170,y:panOrigin.current.y-(point.y-panStart.current.y)/170});return;}stroke.onPointerMove(event);};
  const finishPan=(event:React.PointerEvent<SVGSVGElement>)=>{if(panPointer.current!==event.pointerId)return false;panPointer.current=null;setPanning(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);return true;};
  const pointerUp=(event:React.PointerEvent<SVGSVGElement>)=>{if(!finishPan(event))stroke.onPointerUp(event);};
  const pointerCancel=(event:React.PointerEvent<SVGSVGElement>)=>{if(!finishPan(event))stroke.onPointerCancel(event);};
  useEffect(()=>{const sync=()=>setFullscreen(document.fullscreenElement===visual.current);const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setFullscreen(false);};document.addEventListener("fullscreenchange",sync);document.addEventListener("keydown",key);return()=>{document.removeEventListener("fullscreenchange",sync);document.removeEventListener("keydown",key);};},[]);
  const toggleFullscreen=async()=>{if(fullscreen){if(document.fullscreenElement)await document.exitFullscreen();setFullscreen(false);return;}if(visual.current?.requestFullscreen){try{await visual.current.requestFullscreen();setFullscreen(true);return;}catch{/* Expanded local fallback keeps the existing scene mounted. */}}setFullscreen(true);};
  const map = (z: Complex) => ({ x: 260 + (z.re * zoom + pan.x) * 170, y: 190 - (z.im * zoom + pan.y) * 170 });
  const trace = useMemo(()=>Array.from({ length: 180 }, (_, i) => reconstruct(fourierCoefficients, i / 180)),[fourierCoefficients]);
  const traceEnd = [...trace.slice(0, Math.max(2, Math.floor(phase * trace.length))), endpoint];
  const playgroundCoefficients = useMemo(() => dft(playgroundSamples.map((z) => ({ re: 0, im: z.im }))), [playgroundSamples]);
  const playgroundSignalPlot: EngineeringPlotData = { xLabel: "t, 1", yLabel: "y, 1", xMin: 0, xMax: 1, yMin: Math.min(...playgroundSamples.map((z) => z.im), -1), yMax: Math.max(...playgroundSamples.map((z) => z.im), 1), curves: [{ label: t.signalValue, color: "blue", points: playgroundSamples.map((z, i) => [i / playgroundSamples.length, z.im] as [number, number]) }] };
  const playgroundSpectrumPlot: EngineeringPlotData = { xLabel: "k, 1", yLabel: "A, 1", xMin: 0, xMax: Math.max(1, Math.min(32, playgroundCoefficients.length - 1)), yMin: 0, yMax: Math.max(...playgroundCoefficients.slice(0, 32).map((c) => c.amplitude), 1e-3) * 1.1, curves: [{ label: t.amplitude, color: "violet", points: playgroundCoefficients.slice(0, 32).map((c) => [c.k, c.amplitude] as [number, number]) }] };
  const spectrumRows = fourierAll.slice(0, Math.max(count,24)).map(c => [c.k, isCenteringNoise(c) ? 0 : c.amplitude] as [number, number]).sort((a,b) => a[0]-b[0]);
  const spectrum: EngineeringPlotData = { xLabel: "k, 1", yLabel: "A, 1", xMin: spectrumRows.length ? Math.min(...spectrumRows.map((p) => p[0])) : 0, xMax: spectrumRows.length ? Math.max(...spectrumRows.map((p) => p[0]), 1) : 1, yMin: 0, yMax: Math.max(...spectrumRows.map((p) => p[1]), 1e-3) * 1.1, curves: [{ label: t.amplitude, color: "blue", points: spectrumRows }] };
  const download = (name: string, body: string, type = "text/plain") => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([body], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 10000); };
  const exportCsv = () => download("fourier-contour.csv", ["k,re,im,amplitude,phase", ...fourierAll.slice(0, 2048).map((c) => [c.k, c.re, c.im, c.amplitude, c.phase].join(","))].join("\n"), "text/csv");
  const saveConfig = () => {try{localStorage.setItem("electrotutor-fourier-config", JSON.stringify(config()));setSavedSignature(signature);setConfigMessage("");return true;}catch{setConfigMessage(language==="ru"?"Не удалось сохранить рисунок локально":"Не вдалося зберегти рисунок локально");return false;}};
  const navigationDialog=useUnsavedChanges({dirty:signature!==savedSignature,onSave:saveConfig,language});
  function restoreConfig(text: string) {
    const raw: unknown = JSON.parse(text);
    if (!validateFourierConfig(raw)) throw new Error("invalid-config");
    pushHistory();
    setSavedSignature(fourierDocumentSignature(raw));
    setPlaygroundActive(raw.playground?.active ?? false);
    setPreset(raw.playground?.preset ?? "square");
    setPlaygroundAmplitude(raw.playground?.amplitude ?? 1);
    setPlaygroundPhase(raw.playground?.phase ?? 0);
    setPoints(raw.points); setClosed(raw.closed); setCount(raw.count); seek(raw.phase);
    setSpeed(raw.speed); setLoop(raw.loop); setOrder(raw.order);
    setEnabled(raw.basis === "fourier" ? raw.enabled : {}); setEdited(raw.edited);
    setConfigMessage(raw.basis === "fourier" ? "" : ru
      ? `Контур загружен для круговых движений. Сохранённый базис ${raw.basis} доступен в «Базисных разложениях».`
      : `Контур завантажено для колових рухів. Збережений базис ${raw.basis} доступний у «Базисних розкладах».`);
  }
  async function importConfig(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const ticket = ++importRevision.sequence;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("archive-limit");
      const text = await file.text();
      if (ticket === importRevision.sequence) restoreConfig(text);
    } catch { if (ticket === importRevision.sequence) setConfigMessage(t.invalidConfig); }
  }

  function loadConfig() {
    importRevision.sequence++;
    try { restoreConfig(localStorage.getItem("electrotutor-fourier-config") ?? "null"); }
    catch { setConfigMessage(t.invalidConfig); }
  }
  const setPresetContour = (name: string) => { pushHistory(); setPreset(name); setPlaygroundActive(true); setPoints(signalPreset(name, 128, playgroundAmplitude, playgroundPhase)); setClosed(false); };
  const updateEdit = (key: number, field: "amplitude" | "phase", value: number) => { if (!Number.isFinite(value)) return; const current = fourierAll.find((c) => c.k === key); if (!current) return; setEdited((items) => ({ ...items, [key]: { amplitude: field === "amplitude" ? clamp(value, 0, MAX_CONFIG_AMPLITUDE) : (items[key]?.amplitude ?? current.amplitude), phase: field === "phase" ? clamp(value, -MAX_CONFIG_PHASE, MAX_CONFIG_PHASE) : (items[key]?.phase ?? current.phase) } })); };
  const toggleBasisRow = (index: number) => setEnabled((items) => ({ ...items, [index]: items[index] === false }));
  return <section className="fourier-lab" data-fourier-lab data-fourier-rms={error.rms} data-fourier-trace-endpoint={`${endpoint.re},${endpoint.im}`} aria-label={ru ? "Круговые эпициклы Фурье" : "Колові епіцикли Фур’є"}><fieldset className="lab-ready-guard" disabled={!ready} aria-hidden={!ready}>
    <div className="fourier-toolbar">
      <ContourPresets language={language} initial={initialSignal ? `signal-${initialSignal}` : undefined} onContour={next => { pushHistory(); setPlaygroundActive(false); setClosed(true); setPoints(next); }} onSignal={setPresetContour}/>
      <span className="sr-only" data-motion-state={motionAllowed ? "active" : "reduced-or-hidden"}>{playing ? t.play : t.pause}</span>
      <button type="button" title={t.demo} onClick={() => { pushHistory(); setPlaygroundActive(false); setPoints(demo); setClosed(true); }}>{t.demo}</button>
      <button type="button" title={t.clear} aria-label={t.clear} onClick={() => { pushHistory(); setPlaygroundActive(false); setPoints([]); }}><Eraser size={18}/></button>
      <button type="button" title={t.undo} aria-label={t.undo} disabled={!history.length} onClick={() => {
        const previous = history.at(-1); if (!previous) return;
        setPlaygroundActive(previous.playground?.active ?? false);
        setPreset(previous.playground?.preset ?? "square"); setPlaygroundAmplitude(previous.playground?.amplitude ?? 1); setPlaygroundPhase(previous.playground?.phase ?? 0);
        setPoints(previous.points); setEnabled(previous.enabled); setEdited(previous.edited); setClosed(previous.closed); setHistory(history.slice(0,-1));
      }}><Undo2 size={18}/></button>
      <button type="button" disabled={!motionAllowed} title={motionAllowed ? (playing ? t.pause : t.play) : (ru ? "Анимация приостановлена: уменьшение движения" : "Анімацію призупинено: зменшення руху")} aria-label={playing && motionAllowed ? t.pause : t.play} onClick={() => setPlaying(!playing)}>{playing && motionAllowed ? <Pause size={18}/> : <Play size={18}/>}</button>
      <button type="button" title="Стоп" aria-label="Стоп" onClick={() => {setPlaying(false); seek(0);}}><Square size={17}/></button>
      <button type="button" title={t.step} aria-label={t.step} onClick={() => seek(loop ? (phaseRef.current + 1/64)%1 : Math.min(1,phaseRef.current+1/64))}><StepForward size={18}/></button>
      <button type="button" title={t.reset} aria-label={t.reset} onClick={() => seek(0)}><RotateCcw size={18}/></button>
    </div>
    {configMessage && <p className="fourier-config-error" role="status">{configMessage}</p>}
    <div className="fourier-layout"><div ref={visual} className={`fourier-visual${fullscreen?" fourier-fullscreen":""}`} data-fullscreen={fullscreen}><svg ref={svg} viewBox="0 0 520 380" className="fourier-canvas" data-zoom={zoom} data-pan={`${pan.x},${pan.y}`} data-committed-points={points.length} data-drawing={dragging} data-panning={panning} role="img" aria-label={t.reconstruction} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={pointerCancel}>
      <line x1="20" y1="190" x2="500" y2="190" className="fourier-axis"/><line x1="260" y1="20" x2="260" y2="360" className="fourier-axis"/>{showVectors && chain.map((item, i) => { const a = map(item.start); const b = map(item.end); return <g key={`${item.k}-${i}`}><circle cx={a.x} cy={a.y} r={item.radius * zoom * 170} className="fourier-circle"/><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="fourier-vector"/></g>; })}{showOriginal && <polyline points={samples.map((z) => { const p = map(z); return `${p.x},${p.y}`; }).join(" ")} className="fourier-original" fill="none"/>}<polyline points={Array.from({ length: 241 }, (_, i) => reconstruct(fourierCoefficients, i / 240)).map((z) => { const p = map(z); return `${p.x},${p.y}`; }).join(" ")} className="fourier-reconstructed" fill="none"/>{showTrace && <polyline data-fourier-trace points={traceEnd.map((z) => { const p = map(z); return `${p.x},${p.y}`; }).join(" ")} className="fourier-trace" fill="none"/>}<circle cx={map(endpoint).x} cy={map(endpoint).y} r="5" className="fourier-endpoint"/><polyline ref={preview} data-stroke-preview fill="none" stroke="var(--violet)" strokeWidth="2.4" pointerEvents="none" /></svg><div className="fourier-view-controls"><span>{t.zoom}: {formatEngineeringNumber(zoom, language)}×</span><button title={language==="ru"?"Приблизить":"Наблизити"} aria-label={language==="ru"?"Приблизить":"Наблизити"} onClick={()=>changeZoom({x:260,y:190},1.15)}>+</button><button title={language==="ru"?"Отдалить":"Віддалити"} aria-label={language==="ru"?"Отдалить":"Віддалити"} onClick={()=>changeZoom({x:260,y:190},1/1.15)}>−</button><button title={t.resetView} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{t.resetView}</button><button title={ru?"Полный экран":"Повний екран"} onClick={toggleFullscreen}>{fullscreen?(language==="ru"?"Выйти из полного экрана":"Вийти з повного екрана"):(language==="ru"?"Полный экран":"Повний екран")}</button></div><p className="fourier-hint">{t.draw}. {t.panHint}</p></div>
      <aside className="fourier-panel"><label>{t.harmonics}<input data-fourier-harmonics type="range" min="1" max={MAX_CONFIG_HARMONICS} value={count} onChange={(event) => setCount(+event.target.value)}/><output>{formatEngineeringNumber(count, language)}</output></label><label>{t.speed}<input type="range" min="0" max=".4" step=".01" value={speed} onChange={(event) => setSpeed(+event.target.value)}/></label><label>{t.phase}<input data-fourier-phase type="range" min="0" max="1" step=".001" value={phase} onChange={(event) => seek(+event.target.value)}/></label><label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)}/>{t.loop}</label><label><input type="checkbox" disabled={playgroundActive} checked={!playgroundActive && closed} onChange={(event) => { setClosed(event.target.checked); setEdited({}); setEnabled({}); }}/>{t.closed}</label><label>{t.order}<select value={order} onChange={(event) => setOrder(event.target.value as FourierOrder)}><option value="amplitude">{t.amplitude}</option><option value="frequency">{t.frequency}</option><option value="interleaved">{t.interleaved}</option></select></label><label><input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)}/>{t.original}</label><label><input type="checkbox" checked={showVectors} onChange={(event) => setShowVectors(event.target.checked)}/>{t.vectors}</label><label><input type="checkbox" checked={showTrace} onChange={(event) => setShowTrace(event.target.checked)}/>{t.trace}</label><div className="fourier-error"><b>{t.rms}: {formatEngineeringNumber(error.rms, language)}</b><span>{t.max}: {formatEngineeringNumber(error.max, language)}</span></div></aside></div>
    <div className="fourier-toolbar">
      <button type="button" title={ru?"Сгладить контур":"Згладити контур"} disabled={points.length<3||playgroundActive} onClick={()=>{pushHistory();setPoints(smoothContour(points,closed));}}>{ru?"Сгладить контур":"Згладити контур"}</button>
    </div>
    {!playgroundActive&&currentVertex&&<details className="fourier-card">
      <summary>{ru?"Редактировать точки контура":"Редагувати точки контуру"}</summary>
      <div className="fourier-toolbar">
        <label>{ru?"Номер точки":"Номер точки"} <input type="number" min="1" max={points.length} step="1" value={vertexIndex+1}
          onChange={e=>{if(Number.isInteger(e.target.valueAsNumber))setVertex(Math.max(0,Math.min(points.length-1,e.target.valueAsNumber-1)));}}/></label>
        {(["re","im"] as const).map((part,index)=><label key={part}>{index===0?"x":"y"} <CoefficientInput aria-label={index===0?"x":"y"} type="number" step="any"
          value={currentVertex[part]} onChange={value=>{
            if(Math.abs(value)>1e6||value===currentVertex[part])return;
            pushHistory();setPoints(points.map((point,i)=>i===vertexIndex?{...point,[part]:value}:point));
          }}/></label>)}
        <button type="button" title={ru?"Удалить точку":"Видалити точку"} onClick={()=>{pushHistory();setPoints(points.filter((_,i)=>i!==vertexIndex));}}>{ru?"Удалить точку":"Видалити точку"}</button>
      </div>
    </details>}
    <div className="fourier-lower"><div className="fourier-card"><h3>{t.spectrum}</h3><EngineeringPlot plot={spectrum} language={language} compact kind="stem" label={t.spectrum} showLegend={false}/></div><div className="fourier-card"><h3>{t.table}</h3><div className="fourier-table" data-basis={basis} role="table">{fourierAll.slice(0, count).sort((a,b)=>a.k-b.k).map((coefficient: Coefficient) => <div className="fourier-row" key={coefficient.k}><label><input type="checkbox" checked={enabled[coefficient.k] !== false} onChange={() => toggleBasisRow(coefficient.k)}/><span>k={coefficient.k}</span></label><label><span className="sr-only">{t.amplitude}</span><CoefficientInput aria-label={`amplitude ${coefficient.k}`} inputMode="decimal" displayValue={amplitudeLabel(coefficient)} value={coefficient.amplitude} onChange={(value) => updateEdit(coefficient.k, "amplitude", value)}/></label><label><span className="sr-only">{t.phase}</span><CoefficientInput aria-label={`phase ${coefficient.k}`} inputMode="decimal" displayValue={isCenteringNoise(coefficient) ? "—" : formatEngineeringNumber(coefficient.phase, language)} value={coefficient.phase} onChange={(value) => updateEdit(coefficient.k, "phase", value)}/></label></div>)}</div></div></div>
    {playgroundActive && <section className="fourier-playground"><h3>{ru ? "Скалярный сигнал" : "Скалярний сигнал"} · f(t)</h3>
      <div className="playground-controls">
        <label>{t.amplitude}<input type="range" min=".2" max="1.8" step=".05" value={playgroundAmplitude} onChange={e => {setPlaygroundAmplitude(e.currentTarget.valueAsNumber);setEdited({});}}/></label>
        <label>{t.phase}<input type="range" min="-3.14" max="3.14" step=".01" value={playgroundPhase} onChange={e => {setPlaygroundPhase(e.currentTarget.valueAsNumber);setEdited({});}}/></label>
      </div>
      <div className="fourier-playground-plots" data-fourier-playground>
        <EngineeringPlot plot={playgroundSignalPlot} language={language} compact label={t.signalValue} showLegend={false}/>
        <EngineeringPlot plot={playgroundSpectrumPlot} language={language} compact kind="stem" label={t.spectrum} showLegend={false}/>
      </div>
    </section>}
    <div className="fourier-toolbar" data-fourier-files>
      <button title={t.export} onClick={exportCsv}>{t.export}</button>
      <button title={t.save} onClick={saveConfig}>{t.save}</button>
      <button title={t.load} onClick={loadConfig}>{t.load}</button>
      <button type="button" title={ru ? "Сохранить конфигурацию в файл JSON" : "Зберегти конфігурацію у файл JSON"} data-fourier-export
        onClick={() => download("electrotutor-fourier.json", JSON.stringify(config()), "application/json")}>{ru ? "Сохранить JSON" : "Зберегти JSON"}</button>
      <button type="button" title={ru ? "Открыть файл конфигурации" : "Відкрити файл конфігурації"} onClick={() => jsonInput.current?.click()}>
        {ru ? "Открыть JSON" : "Відкрити JSON"}</button>
      <input type="file" ref={jsonInput} hidden accept=".json,application/json" data-fourier-import onChange={importConfig}/>
    </div>
    {navigationDialog}
  </fieldset></section>;
}
