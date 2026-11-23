import { useState } from "react";
import { Shapes } from "lucide-react";
import { contourShape, type Shape } from "../fourier/contour";
import { motionPresetPoints } from "../fourier/polygon-motion-input";
import type { Complex } from "../fourier/math";
import type { Language } from "../types";

export type SignalPreset = "square" | "triangle" | "saw" | "beats";
export default function ContourPresets({ language, initial, onContour, onSignal }: {
  language: Language; initial?: string; onContour: (points: Complex[]) => void; onSignal: (preset: SignalPreset) => void;
}) {
  const ru = language === "ru";
  const [sides, setSides] = useState(5);
  const [shape, setShape] = useState(initial ?? "");
  const title = ru ? "Готовые объекты" : "Готові об’єкти";
  const labels = { square: "Квадрат", circle: ru ? "Окружность" : "Коло", rectangle: ru ? "Прямоугольник" : "Прямокутник",
    triangle: ru ? "Треугольник" : "Трикутник", polygon: ru ? "Правильный многоугольник" : "Правильний багатокутник", star: ru ? "Звезда" : "Зірка" };
  function apply(value: string) {
    if (value.startsWith("signal-")) { onSignal(value.slice(7) as SignalPreset); return; }
    onContour(value === "star" || value === "circle" ? motionPresetPoints(value) : contourShape(value as Shape, sides));
  }
  return <div className="motion-presets">
    <label title={title}><Shapes size={19} aria-hidden="true" /><span>{title}</span>
      <select aria-label={title} data-contour-preset value={shape} onChange={e => { const value = e.currentTarget.value; setShape(value); apply(value); }}>
        <option value="" disabled>{ru ? "Выбрать объект" : "Вибрати об’єкт"}</option>
        <optgroup label={ru ? "Контуры" : "Контури"}>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</optgroup>
        <optgroup label={ru ? "Сигналы y(t)" : "Сигнали y(t)"}>
          {(["square", "triangle", "saw", "beats"] as const).map((value,index) => <option key={value} value={`signal-${value}`}>
            {(ru ? ["Меандр", "Треугольная волна", "Пила", "Биения"] : ["Меандр", "Трикутна хвиля", "Пилка", "Биття"])[index]}</option>)}
        </optgroup>
      </select>
    </label>
    {shape === "polygon" && <label>{ru ? "Число вершин" : "Кількість вершин"}<select value={sides} onChange={event => {
      const next = Number(event.currentTarget.value); setSides(next); onContour(contourShape("polygon", next));
    }}>{Array.from({length:10}, (_,i) => <option key={i+3}>{i+3}</option>)}</select></label>}
    {shape && <button type="button" title={ru ? "Восстановить выбранный пример" : "Відновити вибраний приклад"}
      onClick={() => apply(shape)}>{ru ? "Восстановить пример" : "Відновити приклад"}</button>}
  </div>;
}
