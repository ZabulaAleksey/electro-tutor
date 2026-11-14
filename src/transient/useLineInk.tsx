import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { CircuitBoardExtension } from "../circuit/CircuitEditor";
import type { Drawing, Point } from "../circuit/drawing";
import { boundedStroke, recognizeInk, type Ink, type SketchKind } from "../engineering/handwriting";
import { svgPoint, usePointerStroke } from "../engineering/usePointerStroke";
import type { Language } from "../types";
import type { Layout } from "./NetworkEditor";
import { archivedAnchors } from "./circuit-archive";
import { DEFAULT_NETWORK, validateNetwork, type Network } from "./network";
import { loadReplacement, placementTargets, type DetachedPart, type Placement, type Selection, type Tool } from "./network-edit";
import { correctInkTarget, correctionKinds, type InkLink } from "./network-ink";

type Props = {
  model: Network;
  layout: Layout;
  detached: DetachedPart[];
  empty: boolean;
  ink: Ink[];
  links: (InkLink | null)[];
  language: Language;
  onAccept: (model: Network, target: Selection | null, layout: Layout, detached: DetachedPart[], ink: Ink, kind: SketchKind, index?: number) => void;
};

const passive = ["wire", "r", "l", "c", "switch"] as const;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const positiveAngle = (angle: number) => (Math.round(angle / 90) * 90 % 360 + 360) % 360;
function drawnSection(layout: Layout, id: string, index: number, a: Point, b: Point): Layout {
  return { ...layout,
    [id]: (a.y + b.y) / 2 - 21,
    ["@x-" + id]: (a.x + b.x) / 2 - (145 + 130 * index),
    ["@span-" + id]: distance(a, b) / 2,
    ["@rot-" + id]: (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 360,
  };
}
const shape = (stroke: Point[]) => stroke.map(p => p.x + "," + p.y).join(" ");

function position(drawing: Drawing, model: Network, target: Placement): Point | undefined {
  if (target.kind === "span" || target.kind === "branch-span") return drawing.positions[model.sections[target.index]?.id];
  if (target.kind === "wire-insert" || target.kind === "branch-key") return drawing.positions[model.branches?.[target.index]?.id ?? ""];
  const anchors = archivedAnchors(drawing);
  const point = anchors && drawing.junctionPositions[anchors.signal[target.index]];
  if (!point) return undefined;
  return target.kind === "end" ? { ...point, x: point.x + 12 } :
    target.kind === "branch" ? { ...point, x: point.x - 12 } : point;
}

export function useLineInk(props: Props): Pick<CircuitBoardExtension, "overlay" | "onStroke"> & {
  controls: (drawing: Drawing) => React.ReactNode;
  active: boolean;
  cancel: () => void;
} {
  const t = (ru: string, uk: string) => props.language === "ru" ? ru : uk;
  const { model, layout, empty, detached } = props;
  const [drawingInk, setDrawingInk] = useState(false);
  const [showOriginals, setShowOriginals] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [ink, setInk] = useState<Ink>([]);
  const [kindOverride, setKindOverride] = useState<SketchKind | "">("");
  const [message, setMessage] = useState("");
  const canvas = useRef<SVGSVGElement>(null);
  const preview = useRef<SVGPolylineElement>(null);
  const touch = useRef<{ id: number; start: Point } | null>(null);
  const touchClick = useRef(false);
  const savedLink = editing === null ? null : props.links[editing];
  const guess = useMemo(() => recognizeInk(ink, 1), [ink]);
  const allowed: SketchKind[] = editing === null
    ? [...(guess?.kind === "line" ? ["line" as const] : []), ...passive, "source", "current", "ground", "junction"]
    : savedLink ? correctionKinds(savedLink) : [];
  const kind = kindOverride || (guess && allowed.includes(guess.kind) ? guess.kind : "");
  const stroke = usePointerStroke({
    svgRef: canvas, previewRef: preview, enabled: drawingInk, pointLimit: 256,
    toPoint: event => canvas.current ? svgPoint(canvas.current, event.clientX, event.clientY) : { x: 0, y: 0 },
    onCommit: points => {
      if (ink.length >= 6) return;
      setInk([...ink, boundedStroke(points)]);
      setKindOverride("");
      setMessage("");
    },
  });
  function stop() {
    stroke.cancel();
    setDrawingInk(false);
    setEditing(null);
    setInk([]);
    setKindOverride("");
    setMessage("");
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    canvas.current = event.currentTarget;
    stroke.onPointerDown(event);
  }
  function reject() {
    setMessage(t("Выберите допустимые выводы на схеме.", "Оберіть допустимі виводи на схемі."));
  }
  function accept(drawing: Drawing) {
    if (!ink.length) return;
    const chosen = kind || "wire";
    if (editing !== null) {
      if (ink === props.ink[editing] && (!savedLink || chosen === savedLink.kind)) { stop(); return; }
      const correction = savedLink ? correctInkTarget(model, detached, savedLink, chosen, empty) : { model, detached };
      if (!correction) { reject(); return; }
      let correctedLayout = layout;
      if (savedLink?.target.kind === "line" && ink !== props.ink[editing]) {
        if (guess?.kind !== "line" || !guess.terminals) { reject(); return; }
        const id = savedLink.target.id;
        correctedLayout = drawnSection(layout, id, model.sections.findIndex(section => section.id === id), ...guess.terminals);
      }
      props.onAccept(correction.model, savedLink?.target ?? null, correctedLayout, correction.detached, ink, chosen, editing);
      stop();
      return;
    }

    const all = ink.flat();
    const points = guess?.terminals;
    const center = guess?.center ?? all[Math.floor(all.length / 2)];
    const anchors = archivedAnchors(drawing);
    const nearest = (p: Point) => anchors?.signal.findIndex(id => {
      const node = drawing.junctionPositions[id];
      return node && distance(node, p) <= 18;
    }) ?? -1;
    function commit(next: Network, target: Selection | null, nextLayout = layout, nextDetached = detached) {
      if (validateNetwork(next).length) { reject(); return; }
      props.onAccept(next, target, nextLayout, nextDetached, ink, chosen);
      stop();
    }
    function install(target?: Placement) {
      if (!target?.edit) { reject(); return; }
      commit(target.edit.model, target.edit.selection);
    }
    if (chosen === "line") {
      if (!points || (!empty && !(
        nearest(points[0]) === model.sections.length && nearest(points[1]) < 0 ||
        nearest(points[1]) === model.sections.length && nearest(points[0]) < 0
      ))) { reject(); return; }
      const target = empty ? { edit: { model: structuredClone(DEFAULT_NETWORK), selection: { kind: "line", id: model.sections[0].id } as const } }
        : placementTargets(model, "line").find(item => item.kind === "end");
      if (!target?.edit || target.edit.selection.kind !== "line") { reject(); return; }
      const id = target.edit.selection.id;
      const [a, b] = !empty && nearest(points[1]) >= 0 || empty && points[0].x > points[1].x
        ? [points[1], points[0]] : points;
      commit(target.edit.model, target.edit.selection, drawnSection(layout, id, empty ? 0 : model.sections.length, a, b));
      return;
    }
    if (chosen === "source" || chosen === "current") {
      const node = nearest(center);
      if (empty || node < 0) { reject(); return; }
      const sign = Math.sin((guess?.angle ?? 0) * Math.PI / 180) < 0 ? -1 : 1;
      commit({ ...model, source: { ...model.source, node, voltageV: chosen === "source" ? sign * 100 : 0,
        currentA: chosen === "current" ? sign : undefined, resistanceOhm: 0 } }, { kind: "source" });
      return;
    }
    if (chosen === "ground") {
      if (empty || nearest(center) !== model.sections.length || model.load.kind !== "open") { reject(); return; }
      commit(loadReplacement(model, { id: model.load.id, kind: "wire" }), { kind: "load", id: model.load.id },
        { ...layout, "@ground-load": 1 });
      return;
    }
    if (chosen === "junction") {
      if (nearest(center) < 0) { reject(); return; }
      commit(model, null);
      return;
    }
    const from = points ? nearest(points[0]) : -1;
    const to = points ? nearest(points[1]) : -1;
    if (!empty && from >= 0 && to >= 0) {
      const tool: Tool = { bridgeFrom: from, part: chosen };
      install(placementTargets(model, tool).find(item => item.kind === "node" && item.index === to));
      return;
    }
    if (!empty && chosen !== "wire") {
      const candidate = placementTargets(model, chosen).find(item => {
        const target = position(drawing, model, item);
        return item.edit && target && distance(target, center) <= 18;
      });
      if (candidate) { install(candidate); return; }
    }
    let index = 1;
    while (detached.some(part => part.id === "draft-" + index)) index++;
    const id = "draft-" + index;
    commit(model, { kind: "detached", id }, layout,
      [...detached, { id, kind: chosen, ...center, rotation: positiveAngle(guess?.angle ?? 0) }]);
  }

  return {
    active: drawingInk,
    cancel: stop,
    onStroke: drawingInk ? { start, move: stroke.onPointerMove, finish: stroke.onPointerUp, cancel: stroke.onPointerCancel } : undefined,
    overlay: () => <g className="circuit-ink" aria-hidden="true">
      {showOriginals && props.ink.flatMap((mark, i) => mark.map((line, j) => <polyline key={i + ":" + j} points={shape(line)} />))}
      {drawingInk && ink.map((line, i) => <polyline key={i} points={shape(line)} />)}
      {drawingInk && <polyline ref={preview} />}
    </g>,
    controls: drawing => <div className="circuit-toolbar circuit-ink-tools">
      <button type="button" aria-pressed={drawingInk} onClick={() => drawingInk ? stop() : setDrawingInk(true)}>
        {t("Рисовать схему", "Малювати схему")}
      </button>
      {!!props.ink.length && <label><input type="checkbox" checked={showOriginals}
        onChange={event => setShowOriginals(event.target.checked)} /> {t("Исходные штрихи", "Початкові штрихи")}</label>}
      {showOriginals && props.ink.map((mark, i) => <button type="button" key={i} onClick={() => {
        setEditing(i); setInk(mark); setDrawingInk(true); setKindOverride(props.links[i]?.kind ?? "");
      }}>{t("Исправить штрих", "Виправити штрих")} {i + 1}</button>)}
      {drawingInk && <>
        <span>{t("Для линии отметьте два конца и проведите между ними штрих.", "Для лінії позначте два кінці й проведіть між ними штрих.")}</span>
        {!!allowed.length && <select aria-label={t("Распознанный элемент", "Розпізнаний елемент")}
          value={kind} onChange={event => setKindOverride(event.target.value as SketchKind)}>
          <option value="" disabled>{t("Выберите тип", "Оберіть тип")}</option>
          {allowed.map(value => <option key={value} value={value}>{value}</option>)}
        </select>}
        <button type="button" disabled={!ink.length || (!kind && (editing === null || !!savedLink))}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0) return;
            touchClick.current = event.pointerType === "touch";
            touch.current = touchClick.current ? { id: event.pointerId, start: { x: event.clientX, y: event.clientY } } : null;
          }}
          onPointerMove={event => {
            if (touch.current?.id === event.pointerId && distance(touch.current.start, { x: event.clientX, y: event.clientY }) > 12) touch.current = null;
          }}
          onPointerCancel={() => { touch.current = null; }}
          onLostPointerCapture={() => { touch.current = null; }}
          onPointerUp={event => {
            const held = touch.current;
            touch.current = null;
            const at = { x: event.clientX, y: event.clientY };
            if (held?.id === event.pointerId && distance(held.start, at) <= 12 &&
              event.currentTarget.contains(document.elementFromPoint(at.x, at.y))) accept(drawing);
          }}
          onClick={event => { if (!touchClick.current || event.detail === 0) accept(drawing); }}>
          {editing === null ? t("Вставить", "Вставити") : t("Сохранить правку", "Зберегти правку")}
        </button>
        <button type="button" disabled={!ink.length} onClick={() => { setInk(ink.slice(0, -1)); setKindOverride(""); }}>
          {t("Убрать штрих", "Прибрати штрих")}
        </button>
        {editing !== null && <button type="button" onClick={stop}>{t("Отменить правку штриха", "Скасувати правку штриха")}</button>}
      </>}
      {message && <p role="status">{message}</p>}
    </div>,
  };
}
