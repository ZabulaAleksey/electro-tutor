import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { downloadSvg } from "../engineering/exportSvg";
import { svgPoint, usePointerStroke } from "../engineering/usePointerStroke";
import { useLocalZoom } from "../engineering/useLocalZoom";
import type { Language } from "../types";
import "./EngineeringBoard.css";
import { MAX_POINTS_TEXT, MAX_STROKES, parseStrokes, serializeStrokes } from "./EngineeringBoardModel";
import { createEraserSession, erasePolylineSegmentsWithSession, MAX_ERASER_PATH_POINTS, type EraserPoint } from "./EngineeringBoardEraser";
import { useUnsavedChanges } from "../engineering/useUnsavedChanges";

type Stroke = { id: number; points: string };
const STORAGE_KEY = "electrotutor-board-v2";
function readStrokes(): { strokes: Stroke[]; error?: string } {
  try{return parseStrokes(localStorage.getItem(STORAGE_KEY));}catch{return{strokes:[],error:"Локальное хранилище недоступно"};}
}
const copy = (items: Stroke[]) => items.map((item) => ({ ...item }));

export default function EngineeringBoard({ language, standalone = false }: { language: Language; standalone?: boolean }) {
  const ru = language === "ru";
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [eraser, setEraser] = useState(false);
  const [eraserRadius, setEraserRadius] = useState(18);
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<Stroke[][]>([]);
  const [redo, setRedo] = useState<Stroke[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftActive, setDraftActive] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const previewRef = useRef<SVGPolylineElement>(null);
  const eraserPreviewRef = useRef<SVGPolylineElement>(null);
  const nextId = useRef(0);
  const lastSaved = useRef("[]");
  const drawing = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const eraserPath = useRef<EraserPoint[]>([]);
  const eraserDrawing = useRef(false);
  const eraserPointer = useRef<number | null>(null);
  const eraserBudgetExceeded = useRef(false);
  const eraserFrame = useRef(0);
  const eraserRadiusRef = useRef(eraserRadius);

  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { eraserRadiusRef.current = eraserRadius; }, [eraserRadius]);
  useEffect(() => () => { cancelAnimationFrame(eraserFrame.current); }, []);

  const storageError = useCallback((message: string) => ru ? message : "Не вдалося відновити локальну дошку: дані пошкоджені або перевищують ліміт.", [ru]);
  useEffect(() => { const result = readStrokes(); const saved = result.strokes; setStrokes(saved); lastSaved.current = JSON.stringify(saved); nextId.current = Math.max(0, ...saved.map((s) => s.id)); if (result.error) setNotice(storageError(result.error)); setReady(true); }, [storageError]);
  useEffect(() => { setDirty(JSON.stringify(strokes) !== lastSaved.current); }, [strokes]);
  const toPoint = (event: Pick<PointerEvent, "clientX" | "clientY">) => {
    const point = svgRef.current ? svgPoint(svgRef.current, event.clientX, event.clientY) : { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(1000, (point.x - pan.x) / zoom)), y: Math.max(0, Math.min(420, (point.y - pan.y) / zoom)) };
  };
  const commit = (points: { x: number; y: number }[]) => {
    if (strokes.length >= MAX_STROKES) { setNotice(ru ? "Достигнут лимит штрихов; сохранённые данные не изменены." : "Досягнуто ліміт штрихів; збережені дані не змінено."); return; }
    const next = { id: ++nextId.current, points: points.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(" ") };
    if (next.points.length > MAX_POINTS_TEXT) { setNotice(ru ? "Штрих слишком длинный; сохранённые данные не изменены." : "Штрих занадто довгий; збережені дані не змінено."); return; }
    setUndo((stack) => [...stack.slice(-49), copy(strokes)]); setRedo([]); setStrokes((items) => [...items, next]);
  };
  const handlers = usePointerStroke({ svgRef, previewRef, toPoint, onCommit: commit, onStart: () => { drawing.current = true; setDraftActive(true); }, onFinish: () => { drawing.current = false; setDraftActive(false); }, enabled: ready && !eraser });
  const clearEraserPreview = () => {
    cancelAnimationFrame(eraserFrame.current);
    eraserFrame.current = 0;
    eraserPreviewRef.current?.setAttribute("points", "");
  };
  const paintEraserPreview = () => {
    if (eraserFrame.current) return;
    eraserFrame.current = requestAnimationFrame(() => {
      eraserFrame.current = 0;
      const preview = eraserPreviewRef.current;
      if (!preview) return;
      preview.setAttribute("points", eraserPath.current.map((point) => `${point.x},${point.y}`).join(" "));
      preview.setAttribute("stroke-width", String(eraserRadiusRef.current * 2));
    });
  };
  const appendEraserPoint = (point: EraserPoint) => {
    const last = eraserPath.current.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) <= 0.25) return;
    if (eraserPath.current.length >= MAX_ERASER_PATH_POINTS) {
      eraserBudgetExceeded.current = true;
      setNotice(ru ? "Ластик слишком длинный; данные не изменены." : "Гумка надто довга; дані не змінено.");
      clearEraserPreview();
      return;
    }
    eraserPath.current.push(point);
  };
  const finishEraser = () => {
    const path = eraserPath.current;
    const current = strokesRef.current;
    if (eraserBudgetExceeded.current) return;
    if (!path.length || !current.length) return;
    const sessionResult = createEraserSession(path, eraserRadiusRef.current);
    if (sessionResult.budgetExceeded || !sessionResult.session) {
      if (sessionResult.budgetExceeded) setNotice(ru ? "Ластик слишком длинный или сложный; данные не изменены." : "Гумка надто довга або складна; дані не змінено.");
      return;
    }
    const session = sessionResult.session;
    let idCursor = nextId.current;
    const next: Stroke[] = [];
    for (const stroke of current) {
      const eraseResult = erasePolylineSegmentsWithSession(stroke.points, session);
      if (eraseResult.budgetExceeded) {
        setNotice(ru ? "Ластик слишком длинный или сложный; данные не изменены." : "Гумка надто довга або складна; дані не змінено.");
        return;
      }
      const segments = eraseResult.segments;
      if (segments.some((points) => points.length > MAX_POINTS_TEXT)) {
        setNotice(ru ? "Штрих слишком длинный; данные не изменены." : "Штрих занадто довгий; дані не змінено.");
        return;
      }
      segments.forEach((points, index) => {
        next.push({ id: index === 0 ? stroke.id : ++idCursor, points });
      });
    }
    if (next.length > MAX_STROKES) {
      setNotice(ru ? "Достигнут лимит штрихов; данные не изменены." : "Досягнуто ліміт штрихів; дані не змінено.");
      return;
    }
    const changed = next.length !== current.length || next.some((stroke, index) => stroke.id !== current[index]?.id || stroke.points !== current[index]?.points);
    if (!changed) return;
    nextId.current = Math.max(nextId.current, idCursor);
    setUndo((stack) => [...stack.slice(-49), copy(current)]);
    setRedo([]);
    strokesRef.current = next;
    setStrokes(next);
  };
  const cancelEraser = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!eraserDrawing.current || event.pointerId !== eraserPointer.current) return;
    eraserDrawing.current = false;
    eraserBudgetExceeded.current = false;
    eraserPath.current = [];
    eraserPointer.current = null;
    drawing.current = false;
    setDraftActive(false);
    clearEraserPreview();
  };
  const eraserHandlers = {
    onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!ready || !eraser || !event.isPrimary || event.button !== 0 || event.altKey) return;
      eraserDrawing.current = true;
      eraserBudgetExceeded.current = false;
      eraserPointer.current = event.pointerId;
      eraserPath.current = [];
      appendEraserPoint(toPoint(event.nativeEvent));
      drawing.current = true;
      setDraftActive(true);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      paintEraserPreview();
    },
    onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!eraserDrawing.current || event.pointerId !== eraserPointer.current) return;
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
      coalesced.forEach((point) => appendEraserPoint(toPoint(point)));
      appendEraserPoint(toPoint(event.nativeEvent));
      event.preventDefault();
      paintEraserPreview();
    },
    onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!eraserDrawing.current || event.pointerId !== eraserPointer.current) return;
      appendEraserPoint(toPoint(event.nativeEvent));
      event.preventDefault();
      finishEraser();
      eraserDrawing.current = false;
      eraserBudgetExceeded.current = false;
      eraserPointer.current = null;
      eraserPath.current = [];
      drawing.current = false;
      setDraftActive(false);
      clearEraserPreview();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: cancelEraser,
    onLostPointerCapture: cancelEraser,
  };
  useLocalZoom(svgRef, (point, factor) => {
    if (drawing.current) return;
    setZoom((current) => { const next = Math.max(.65, Math.min(2.5, current * factor)); const ratio = next / current; setPan((old) => ({ x: point.x - (point.x - old.x) * ratio, y: point.y - (point.y - old.y) * ratio })); return next; });
  });
  const changeZoom = (delta: number) => {if(drawing.current)return;setZoom((value) => Math.max(.65, Math.min(2.5, Math.round((value + delta) * 20) / 20)));};
  const saveLocal = () => { try { const serialized = serializeStrokes(strokes); localStorage.setItem(STORAGE_KEY, serialized); lastSaved.current = serialized; setDirty(false); setNotice(""); return true; } catch { setNotice(ru ? "Не удалось сохранить доску: недостаточно локального места." : "Не вдалося зберегти дошку: недостатньо локального місця."); return false; } };
  const navigationDialog = useUnsavedChanges({ dirty, onSave: saveLocal, language });
  const restoreLocal = () => { const result = readStrokes(); if (result.error) { setNotice(storageError(result.error)); return; } const saved = result.strokes; setStrokes(saved); lastSaved.current = JSON.stringify(saved); setUndo([]); setRedo([]); nextId.current = Math.max(0, ...saved.map((item) => item.id)); setDirty(false); setNotice(""); };
  const saveSvg = () => { if (!saveLocal()) return; if (svgRef.current) downloadSvg(svgRef.current, "electrotutor-board.svg"); };
  const doUndo = () => setUndo((stack) => { const previous = stack.at(-1); if (!previous) return stack; setRedo((items) => [...items.slice(-49), copy(strokes)]); setStrokes(copy(previous)); return stack.slice(0, -1); });
  const doRedo = () => setRedo((stack) => { const next = stack.at(-1); if (!next) return stack; setUndo((items) => [...items.slice(-49), copy(strokes)]); setStrokes(copy(next)); return stack.slice(0, -1); });
  const clear = () => { if (!strokes.length) return; setUndo((stack) => [...stack.slice(-49), copy(strokes)]); setRedo([]); setStrokes([]); };
  const transformed = `translate(${pan.x} ${pan.y}) scale(${zoom})`;
  return <section className="engineering-board section" id="engineering-board" aria-labelledby="board-heading" data-board-dirty={dirty ? "true" : "false"} data-board-ready={ready}>
    <div className="lab-section-title"><div><span className="section-kicker">03 / WORKSPACE</span><h2 id="board-heading">{standalone ? (ru ? "Интерактивная доска" : "Інтерактивна дошка") : (ru ? "Инженерная доска" : "Інженерна дошка")}</h2></div><span>{ru ? "Локальная · без синхронизации" : "Локальна · без синхронізації"}</span></div>
    <div className="board-toolbar" aria-label={ru ? "Инструменты доски" : "Інструменти дошки"}>
      <button type="button" disabled={draftActive} aria-pressed={!eraser} onClick={() => setEraser(false)}>✎ {ru ? "Перо" : "Перо"}</button><button type="button" disabled={draftActive} aria-pressed={eraser} onClick={() => setEraser(true)}>{ru ? "Ластик" : "Гумка"}</button>
      {eraser && <label className="board-eraser-control">{ru ? "Радиус" : "Радіус"}<input type="range" min="6" max="48" step="2" value={eraserRadius} disabled={draftActive} aria-label={ru ? "Размер ластика" : "Розмір гумки"} onChange={(event) => setEraserRadius(Number(event.target.value))} /><output>{eraserRadius}</output></label>}
      <button type="button" disabled={draftActive || !undo.length} onClick={doUndo}>↶ {ru ? "Отменить" : "Скасувати"}</button><button type="button" disabled={draftActive || !redo.length} onClick={doRedo}>↷ {ru ? "Повторить" : "Повторити"}</button><button type="button" disabled={draftActive || !strokes.length} onClick={clear}>{ru ? "Очистить" : "Очистити"}</button><button type="button" disabled={draftActive} onClick={saveLocal}>{ru ? "Сохранить" : "Зберегти"}</button><button type="button" disabled={draftActive} onClick={restoreLocal}>{ru ? "Восстановить" : "Відновити"}</button><button type="button" disabled={draftActive} onClick={saveSvg}>{ru ? "Сохранить SVG" : "Зберегти SVG"} ↓</button>
      <span className="board-zoom"><button type="button" disabled={draftActive} onClick={() => changeZoom(-.1)} aria-label={ru ? "Уменьшить" : "Зменшити"}>−</button><output>{Math.round(zoom * 100)}%</output><button type="button" disabled={draftActive} onClick={() => changeZoom(.1)} aria-label={ru ? "Увеличить" : "Збільшити"}>+</button><button type="button" disabled={draftActive} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{ru ? "Сброс" : "Скинути"}</button></span>
    </div>
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 420" className="board-canvas" role="img" aria-label={ru ? "Доска для рисования; ластик удаляет часть штриха" : "Дошка для малювання; гумка видаляє частину штриха"} {...(eraser ? eraserHandlers : handlers)}>
      <defs><pattern id="board-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0 H0 V20" fill="none" stroke="var(--grid-minor)" /></pattern></defs><rect width="1000" height="420" fill="var(--surface-canvas)" /><rect width="1000" height="420" fill="url(#board-grid)" />
      <g transform={transformed}><g fill="none" stroke="var(--schematic-wire)" strokeWidth="2"><path d="M90 140 H150 M210 140 H340 V190 M340 210 V265 H90 V225 M90 185 V140" /><rect x="150" y="130" width="60" height="20" /><circle cx="90" cy="205" r="20" /><path d="M322 190 H358 M322 210 H358 M340 140 V190 M340 210 V265" /></g><g fill="var(--schematic-wire)" fontSize="18" fontFamily="sans-serif"><text x="165" y="115">R = 1 kΩ</text><text x="85" y="211">+</text><text x="40" y="305">E = 12 V</text><text x="365" y="210">C = 1000 µF</text><text x="540" y="105">uC(t) = 12 (1 − exp(−t / τ)) V</text><text x="540" y="135">τ = RC = 1 s</text><text x="555" y="190">uC, V</text><text x="900" y="345">t, s</text></g><path d="M560 200 V320 H920" fill="none" stroke="var(--axis-color)" /><polyline points={Array.from({ length: 101 }, (_, k) => `${560 + k * 3.6},${320 - 106 * (1 - Math.exp(-k / 20))}`).join(" ")} fill="none" stroke="var(--blue)" strokeWidth="3" /><polyline ref={previewRef} className="board-preview" fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><polyline ref={eraserPreviewRef} className="board-eraser-preview" fill="none" stroke="var(--orange, #f59e0b)" strokeWidth={eraserRadius * 2} strokeLinecap="round" strokeLinejoin="round" />{strokes.map((stroke) => <polyline key={stroke.id} data-board-stroke={stroke.id} points={stroke.points} fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />)}</g>
    </svg><small>{notice || (ready ? (ru ? "Рисуйте поверх примера. Ластик удаляет часть штриха; Ctrl + колесо меняет масштаб." : "Малюйте поверх прикладу. Гумка видаляє частину штриха; Ctrl + колесо змінює масштаб.") : (ru ? "Восстановление локальной доски…" : "Відновлення локальної дошки…"))}</small>
    {navigationDialog}
  </section>;
}
