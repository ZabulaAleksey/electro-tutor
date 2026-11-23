import { useRef, useState, type PointerEvent } from "react";
import { svgPoint } from "../engineering/usePointerStroke";
import type { Language } from "../types";

import { paintInterval, type FunctionCursor } from "../fourier/drawn-function";

export function BasisFunctionCanvas({ language, values, onChange }: {
  language: Language; values: number[]; onChange: (values: number[]) => void;
}) {
  const [draft, setDraft] = useState<number[]>();
  const active = useRef<{ id: number; cursor: FunctionCursor; values: number[] } | null>(null);
  const curve = draft ?? values;
  function cursor(event: PointerEvent<SVGSVGElement>): FunctionCursor {
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    return {
      index: Math.round(Math.max(0, Math.min(1, (point.x - 28) / 352)) * (values.length - 1)),
      y: Math.max(-1, Math.min(1, (105 - point.y) / 82)),
    };
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const stroke = active.current;
    if (!stroke || stroke.id !== event.pointerId) return;
    const next = cursor(event);
    stroke.values = paintInterval(stroke.values, stroke.cursor, next);
    stroke.cursor = next;
    setDraft(stroke.values);
  }
  function finish() { active.current = null; setDraft(undefined); }
  const label = language === "ru" ? "Рисование функции y(x)" : "Малювання функції y(x)";
  return <svg viewBox="0 0 400 210" role="img" aria-label={label} className="basis-drawing" data-function-drawing
    onPointerDown={event => {
      if (active.current || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = { id: event.pointerId, cursor: cursor(event), values };
      move(event);
    }} onPointerMove={move} onPointerUp={event => {
      if (active.current?.id !== event.pointerId) return;
      move(event); onChange(active.current.values); finish();
    }} onPointerCancel={finish} onLostPointerCapture={finish}>
    <path d="M28 23V187M28 105H380" className="basis-board-axes" />
    <g className="basis-axis-labels"><text x="10" y="108">0</text><text x="8" y="27">1</text>
      <text x="2" y="188">−1</text><text x="373" y="123">1</text><text x="385" y="105">x</text><text x="30" y="16">y</text></g>
    <polyline className="basis-path-result" points={curve.map((y, index) => `${28 + 352 * index / (curve.length - 1)},${105 - 82 * y}`).join(" ")} />
  </svg>;
}
