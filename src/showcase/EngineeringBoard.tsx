import { useCallback, useEffect, useRef, useState } from "react";
import { downloadSvg } from "../engineering/exportSvg";
import { svgPoint, usePointerStroke } from "../engineering/usePointerStroke";
import { useLocalZoom } from "../engineering/useLocalZoom";
import type { Language } from "../types";
import "./EngineeringBoard.css";
import { MAX_POINTS_TEXT, MAX_STROKES, parseStrokes, serializeStrokes } from "./EngineeringBoardModel";
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
  const [dirty, setDirty] = useState(false);
  const [undo, setUndo] = useState<Stroke[][]>([]);
  const [redo, setRedo] = useState<Stroke[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const previewRef = useRef<SVGPolylineElement>(null);
  const nextId = useRef(0);
  const lastSaved = useRef("[]");
  const drawing = useRef(false);

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
  const handlers = usePointerStroke({ svgRef, previewRef, toPoint, onCommit: commit, onStart: () => { drawing.current = true; }, onFinish: () => { drawing.current = false; }, enabled: ready && !eraser });
  useLocalZoom(svgRef, (point, factor) => {
    if (drawing.current) return;
    setZoom((current) => { const next = Math.max(.65, Math.min(2.5, current * factor)); const ratio = next / current; setPan((old) => ({ x: point.x - (point.x - old.x) * ratio, y: point.y - (point.y - old.y) * ratio })); return next; });
  });
  const changeZoom = (delta: number) => {if(drawing.current)return;setZoom((value) => Math.max(.65, Math.min(2.5, Math.round((value + delta) * 20) / 20)));};
  const saveLocal = () => { try { const serialized = serializeStrokes(strokes); localStorage.setItem(STORAGE_KEY, serialized); lastSaved.current = serialized; setDirty(false); setNotice(""); return true; } catch { setNotice(ru ? "Не удалось сохранить доску: недостаточно локального места." : "Не вдалося зберегти дошку: недостатньо локального місця."); return false; } };
  const navigationDialog = useUnsavedChanges({ dirty, onSave: saveLocal, language });
  const restoreLocal = () => { const result = readStrokes(); if (result.error) { setNotice(storageError(result.error)); return; } const saved = result.strokes; setStrokes(saved); lastSaved.current = JSON.stringify(saved); setUndo([]); setRedo([]); nextId.current = Math.max(0, ...saved.map((item) => item.id)); setDirty(false); setNotice(""); };
  const saveSvg = () => { if (!saveLocal()) return; if (svgRef.current) downloadSvg(svgRef.current, "electrotutor-board.svg"); };
  const erase = (id: number) => { setUndo((stack) => [...stack.slice(-49), copy(strokes)]); setRedo([]); setStrokes((items) => items.filter((item) => item.id !== id)); };
  const doUndo = () => setUndo((stack) => { const previous = stack.at(-1); if (!previous) return stack; setRedo((items) => [...items.slice(-49), copy(strokes)]); setStrokes(copy(previous)); return stack.slice(0, -1); });
  const doRedo = () => setRedo((stack) => { const next = stack.at(-1); if (!next) return stack; setUndo((items) => [...items.slice(-49), copy(strokes)]); setStrokes(copy(next)); return stack.slice(0, -1); });
  const clear = () => { if (!strokes.length) return; setUndo((stack) => [...stack.slice(-49), copy(strokes)]); setRedo([]); setStrokes([]); };
  const transformed = `translate(${pan.x} ${pan.y}) scale(${zoom})`;
  return <section className="engineering-board section" id="engineering-board" aria-labelledby="board-heading" data-board-dirty={dirty ? "true" : "false"} data-board-ready={ready}>
    <div className="lab-section-title"><div><span className="section-kicker">03 / WORKSPACE</span><h2 id="board-heading">{standalone ? (ru ? "Интерактивная доска" : "Інтерактивна дошка") : (ru ? "Инженерная доска" : "Інженерна дошка")}</h2></div><span>{ru ? "Локальная · без синхронизации" : "Локальна · без синхронізації"}</span></div>
    <div className="board-toolbar" aria-label={ru ? "Инструменты доски" : "Інструменти дошки"}>
      <button type="button" aria-pressed={!eraser} onClick={() => setEraser(false)}>✎ {ru ? "Перо" : "Перо"}</button><button type="button" aria-pressed={eraser} onClick={() => setEraser(true)}>{ru ? "Ластик" : "Гумка"}</button>
      <button type="button" disabled={!undo.length} onClick={doUndo}>↶ {ru ? "Отменить" : "Скасувати"}</button><button type="button" disabled={!redo.length} onClick={doRedo}>↷ {ru ? "Повторить" : "Повторити"}</button><button type="button" disabled={!strokes.length} onClick={clear}>{ru ? "Очистить" : "Очистити"}</button><button type="button" onClick={saveLocal}>{ru ? "Сохранить" : "Зберегти"}</button><button type="button" onClick={restoreLocal}>{ru ? "Восстановить" : "Відновити"}</button><button type="button" onClick={saveSvg}>{ru ? "Сохранить SVG" : "Зберегти SVG"} ↓</button>
      <span className="board-zoom"><button type="button" onClick={() => changeZoom(-.1)} aria-label={ru ? "Уменьшить" : "Зменшити"}>−</button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => changeZoom(.1)} aria-label={ru ? "Увеличить" : "Збільшити"}>+</button><button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{ru ? "Сброс" : "Скинути"}</button></span>
    </div>
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 420" className="board-canvas" role="img" aria-label={ru ? "Доска для рисования; ластик удаляет выбранный штрих" : "Дошка для малювання; гумка видаляє обраний штрих"} {...handlers}>
      <defs><pattern id="board-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0 H0 V20" fill="none" stroke="var(--grid-minor)" /></pattern></defs><rect width="1000" height="420" fill="var(--surface-canvas)" /><rect width="1000" height="420" fill="url(#board-grid)" />
      <g transform={transformed}><g fill="none" stroke="var(--schematic-wire)" strokeWidth="2"><path d="M90 140 H150 M210 140 H340 V190 M340 210 V265 H90 V225 M90 185 V140" /><rect x="150" y="130" width="60" height="20" /><circle cx="90" cy="205" r="20" /><path d="M322 190 H358 M322 210 H358 M340 140 V190 M340 210 V265" /></g><g fill="var(--schematic-wire)" fontSize="18" fontFamily="sans-serif"><text x="165" y="115">R = 1 kΩ</text><text x="85" y="211">+</text><text x="40" y="305">E = 12 V</text><text x="365" y="210">C = 1000 µF</text><text x="540" y="105">uC(t) = 12 (1 − exp(−t / τ)) V</text><text x="540" y="135">τ = RC = 1 s</text><text x="555" y="190">uC, V</text><text x="900" y="345">t, s</text></g><path d="M560 200 V320 H920" fill="none" stroke="var(--axis-color)" /><polyline points={Array.from({ length: 101 }, (_, k) => `${560 + k * 3.6},${320 - 106 * (1 - Math.exp(-k / 20))}`).join(" ")} fill="none" stroke="var(--blue)" strokeWidth="3" /><polyline ref={previewRef} className="board-preview" fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{strokes.map((stroke) => <polyline key={stroke.id} data-board-stroke={stroke.id} points={stroke.points} fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: eraser ? "stroke" : "none" }} onPointerDown={(event) => { if (eraser) { event.stopPropagation(); erase(stroke.id); } }} />)}</g>
    </svg><small>{notice || (ready ? (ru ? "Рисуйте поверх примера. Ctrl + колесо меняет масштаб; обычное колесо прокручивает страницу." : "Малюйте поверх прикладу. Ctrl + колесо змінює масштаб; звичайне колесо прокручує сторінку.") : (ru ? "Восстановление локальной доски…" : "Відновлення локальної дошки…"))}</small>
    {navigationDialog}
  </section>;
}
