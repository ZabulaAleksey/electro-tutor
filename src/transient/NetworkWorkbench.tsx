import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, CircleHelp, Crosshair, Maximize, Plus, Redo2, Undo2 } from "lucide-react";
import type { Language } from "../types";
import { formatEngineeringNumber } from "../engineering/format";
import { contactClosed, type Load, type Network } from "./network";
import { LoadCircuit, type Layout } from "./NetworkEditor";
import { placementTargets, type Placement, type Selection, type Tool } from "./network-edit";
import { networkError } from "./network-copy";

type Point = { x: number; y: number };
type View = Point & { zoom: number };
type Gesture = { id: number; start: Point; tool?: Tool; selection?: Selection; moved: boolean };
type Props = {
  model: Network;
  layout: Layout;
  language: Language;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onCommit: (model: Network, selection: Selection) => void;
  inspector: (arm: (tool: Tool) => void) => ReactNode;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  load: Load;
  time: number;
  tools: ReactNode;
  transport: ReactNode;
  timing: ReactNode;
  reference: string;
};
const axis = 84;
const nodeX = (index: number) => 58 + index * 170;
const offset = (kind: Placement["kind"]) => kind === "span" || kind==="branch-span" ? 85 : kind === "end" ? 62 : 0;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const parts = ["r", "switch", "shunt", "matched", "l", "c", "open", "wire"] as const;
const icons = { line: "═", shunt: "⊥", matched: "Z₀", r: "▭", l: "∿", c: "⊣⊢", open: "○ ○", wire: "─", switch: "⎯╱" };

export default function NetworkWorkbench(props: Props) {
  const { model, layout, language, selected, onSelect, onCommit } = props;
  const ru = language === "ru";
  const t = (a: string, b: string) => ru ? a : b;
  const [tray, setTray] = useState<"parts" | "inspect" | "help" | null>(null);
  const [armed, setArmed] = useState<Tool | null>(null);
  const [preview, setPreview] = useState<{ tool: Tool; point: Point; touch: boolean; target?: Placement } | null>(null);
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState<Placement | null>(null);
  const [viewport, setViewport] = useState({ width: 680, height: 330 });
  const [camera, setCamera] = useState<View | null>(null);
  const [visible, setVisible] = useState({ inset: 0, height: 0 });
  const canvas = useRef<SVGSVGElement>(null);
  const timing = useRef<HTMLDetailsElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinching = useRef(false);
  const suppress = useRef(false);
  const frame = useRef(0);
  const width = nodeX(model.sections.length) + 135;
  const height = Math.max(255,245+(model.branches?.length??0)*9);
  const fit = Math.min(1.4, viewport.width / width, Math.max(120,viewport.height-45) / height);
  const view = camera ?? { x: (viewport.width - width * fit) / 2, y: (viewport.height - height * fit + 32) / 2, zoom: fit };
  const tool = preview?.tool ?? armed;
  const targets = useMemo(() => tool ? placementTargets(model, tool) : [], [model, tool]);
  const labels = {
    line: t("Добавить линию", "Додати лінію"),
    shunt: t("Шунтирующий резистор", "Шунтувальний резистор"),
    matched: t("Согласованная нагрузка", "Узгоджене навантаження"),
    r: t("Резистор", "Резистор"),
    switch: t("Ключ", "Ключ"),
    l: t("Концевая индуктивность", "Кінцева індуктивність"),
    c: t("Концевой конденсатор", "Кінцевий конденсатор"),
    open: t("Разомкнутый конец", "Розімкнений кінець"),
    wire: t("Короткое замыкание", "Коротке замикання"),
  };
  const reasons: Record<string, string> = {
    "choose-connection": t("Выберите стык, участок или шунтирующую ветвь.", "Оберіть стик, ділянку або шунтувальну гілку."),
    "occupied-joint": t("В этом стыке уже установлен элемент.", "У цьому стику вже є елемент."),
    "choose-end": t("Подключите элемент в конце цепочки.", "Під’єднайте елемент у кінці ланцюжка."),
    "free-node": t("Выберите свободный узел для шунта.", "Оберіть вільний вузол для шунта."),
    "choose-node": t("Выберите другой узел источника.", "Оберіть інший вузол джерела."),
    "choose-line": t("Выберите новую позицию участка.", "Оберіть нову позицію ділянки."),
    "section-limit": t("Достигнут предел участков расчётной модели.", "Досягнуто межі ділянок розрахункової моделі."),
    "short-section": t("Участок слишком короткий для разделения.", "Ділянка закоротка для поділу."),
  };
  const explain = (error?: string) => error ? reasons[error] ?? networkError(error, language) :
    t("Выберите подсвеченную точку на схеме.", "Оберіть підсвічену точку на схемі.");
  const zone = (target: Placement) => {
    switch (target.kind) {
      case "end": return t("Конец линии", "Кінець лінії");
      case "span": return tool==="r"||tool==="switch"||typeof tool==="object"&&tool&&"relocate" in tool
        ? t("В разрыв линии", "У розрив лінії") : t("Вдоль линии", "Уздовж лінії");
      case "joint": return t("Последовательный стык", "Послідовний стик");
      case "branch-key": return t("Ключ в существующую ветвь","Ключ у наявну гілку");
      case "branch-span":
      case "branch": return t("Шунт к опоре", "Шунт до опори");
      default: return t("Узел соединения", "Вузол з’єднання");
    }
  };
  const name = (target: Placement) => target.kind === "end" ? zone(target) :
    zone(target) + " · " + (target.kind === "span" ? model.sections[target.index].id : target.index);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setViewport({ width, height });
    });
    observer.observe(element);
    const visual = window.visualViewport;
    const update = () => {
      if (visual) setVisible({ inset: Math.max(0, window.innerHeight - visual.height - visual.offsetTop), height: visual.height });
    };
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  function local(point: Point): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }
  function zoomAt(center: Point, factor: number, next = center) {
    setCamera(previous => {
      const current = previous ?? view;
      const zoom = Math.max(fit / 2, Math.min(3.5, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return { x: next.x - (center.x - current.x) * ratio, y: next.y - (center.y - current.y) * ratio, zoom };
    });
  }
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(local({ x: event.clientX, y: event.clientY }), Math.exp(-event.deltaY * .0015));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  function cancel() {
    suppress.current = !!gesture.current;
    gesture.current = null;
    touches.current.clear();
    pinching.current = false;
    cancelAnimationFrame(frame.current);
    setArmed(null);
    setHovered(null);
    setPreview(null);
    setMessage("");
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (armed || preview || tray || gesture.current)) {
        cancel();
        setTray(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [armed, preview, tray]);

  const junctionX = (index: number) => nodeX(index)-(model.series?.some(link=>link.from===index)?15:0);
  const targetPoint = (target: Placement): Point => {
    if(target.kind==="branch-key"){
      const branch=model.branches![target.index], from=junctionX(branch.from);
      return {x:view.x+(branch.to==="reference"?from-23:(from+junctionX(branch.to))/2)*view.zoom,
        y:view.y+(branch.to==="reference"?160:234+target.index*9)*view.zoom};
    }
    return {x:view.x+((target.kind==="node"||target.kind==="branch"?junctionX(target.index):nodeX(target.index))+offset(target.kind))*view.zoom,
      y:view.y+(target.kind==="span"?layout[model.sections[target.index].id]??axis:
        target.kind==="branch"||target.kind==="branch-span"?147:axis)*view.zoom};
  };
  function targetAt(point: Point, options: Placement[], touch: boolean) {
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !canvas.current?.contains(hit) && !hit.closest(".network-tray-parts")) return;
    const bounds=canvas.current!.getBoundingClientRect();
    if(point.x<bounds.left||point.x>bounds.right||point.y<bounds.top||point.y>bounds.bottom)return;
    const location = local(point);
    let best = touch ? 30 : 23;
    let nearest: Placement | undefined;
    for (const option of options) {
      const gap = distance(location, targetPoint(option));
      if (gap < best || gap === best && option.edit && !nearest?.edit) {
        best = gap;
        nearest = option;
      }
    }
    return nearest;
  }
  function place(target?: Placement) {
    if (!target?.edit) {
      setMessage(explain(target?.error));
      return;
    }
    if (target.edit.selection.kind === "load" && !target.edit.selection.id) {
      const replacesBranch = !!model.load.children?.length;
      const removesEvents = target.edit.model.events.length < model.events.length;
      const warning = replacesBranch && removesEvents
        ? t("Заменить нагрузку, её вложенные элементы и записанные события?", "Замінити навантаження, його вкладені елементи й записані події?")
        : replacesBranch ? t("Заменить нагрузку вместе с её вложенными элементами?", "Замінити навантаження разом із вкладеними елементами?")
          : removesEvents ? t("События прежней нагрузки будут удалены. Продолжить?", "Події попереднього навантаження буде видалено. Продовжити?") : "";
      if (warning && !window.confirm(warning)) return;
    }
    onCommit(target.edit.model, target.edit.selection);
    setArmed(null);
    setHovered(null);
    setTray(null);
    setMessage("");
  }
  function arm(next: Tool) {
    setHovered(null);
    setArmed(next);
    setTray(null);
    setMessage(typeof next === "object"
      ? "bridgeFrom" in next ? t("Выберите второй узел перемычки.", "Оберіть другий вузол перемички.")
        : "relocate" in next ? explain("choose-connection")
          : explain(next.move.kind === "line" ? "choose-line" : next.move.kind === "source" ? "choose-node" : "free-node")
      : next==="shunt" ? t("Выберите узел или середину участка.", "Оберіть вузол або середину ділянки.")
        : next==="r"||next==="switch" ? explain("choose-connection") : explain("choose-end"));
    const rect = canvas.current?.getBoundingClientRect();
    if (rect && (rect.bottom <= 0 || rect.top >= window.innerHeight - 56)) canvas.current?.scrollIntoView({ block: "center" });
    requestAnimationFrame(() => canvas.current?.querySelector<SVGElement>("[data-allowed=true]")?.focus({ preventScroll: true }));
  }
  function start(event: PointerEvent<Element>, next?: Tool, selection?: Selection) {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!next || selection) {
      touches.current.set(event.pointerId, point);
      if (touches.current.size > 1) {
        gesture.current = null;
        pinching.current = true;
        cancelAnimationFrame(frame.current);
        setPreview(null);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (gesture.current || pinching.current) return;
    suppress.current = false;
    gesture.current = { id: event.pointerId, start: point, tool: next, selection, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const point = { x: event.clientX, y: event.clientY };
    const prior = touches.current.get(event.pointerId);
    if (prior && pinching.current) {
      const other = [...touches.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      touches.current.set(event.pointerId, point);
      if (other) {
        const middle = (a: Point) => local({ x: (a.x + other.x) / 2, y: (a.y + other.y) / 2 });
        zoomAt(middle(prior), distance(point, other) / Math.max(1, distance(prior, other)), middle(point));
      }
      return;
    }
    if (prior) touches.current.set(event.pointerId, point);
    const current = gesture.current;
    if (!current || current.id !== event.pointerId || !current.moved && distance(current.start, point) < 7) return;
    const first = !current.moved;
    current.moved = true;
    if (current.tool) {
      const next = current.tool;
      const touch = event.pointerType === "touch";
      const options = tool === next ? targets : placementTargets(model, next);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setPreview({ tool: next, point, touch, target: targetAt(point, options, touch) }));
    } else if (prior && !current.selection) {
      const previous = first ? current.start : prior;
      setCamera(value => ({ ...(value ?? view), x: (value ?? view).x + point.x - previous.x, y: (value ?? view).y + point.y - previous.y }));
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>, canceled = false) {
    touches.current.delete(event.pointerId);
    if (pinching.current) {
      if (!touches.current.size) pinching.current = false;
      return;
    }
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    setPreview(null);
    suppress.current = current.moved || canceled;
    if (canceled) return;
    if (current.moved && current.tool) {
      const options = tool === current.tool ? targets : placementTargets(model, current.tool);
      place(targetAt({ x: event.clientX, y: event.clientY }, options, event.pointerType === "touch"));
    } else if (!current.moved && current.selection) {
      onSelect(current.selection);
      if(timing.current)timing.current.open=false;
      setTray("inspect");
    }
  }
  function center() {
    if (!selected) return;
    const index = selected.kind === "line" ? model.sections.findIndex(s => s.id === selected.id) :
      selected.kind === "shunt" ? selected.node : selected.kind === "source" ? model.source.node :
      selected.kind === "contact" ? [...model.series??[],...model.branches??[]].find(link=>link.id===selected.id)!.from : model.sections.length;
    const x = nodeX(index) + (selected.kind === "line" ? 85 : selected.kind === "load" ? 62 : 0);
    setCamera({ ...view, x: viewport.width / 2 - x * view.zoom, y: viewport.height / 2 - 110 * view.zoom });
  }
  function toggle(next: typeof tray) {
    cancel();
    setTray(tray === next ? null : next);
  }
  function object(selection: Selection, label: string) {
    const movable = selection.kind === "shunt" || selection.kind === "source" ||
      selection.kind === "line" && model.sections.length > 1;
    return {
      role: "button",
      tabIndex: tool ? -1 : 0,
      "aria-label": label,
      "aria-pressed": selected?.kind === selection.kind &&
        (selection.kind !== "line" || selected.kind === "line" && selected.id === selection.id) &&
        (selection.kind !== "shunt" || selected.kind === "shunt" && selected.node === selection.node) &&
        (selection.kind !== "contact" || selected.kind === "contact" && selected.id === selection.id) &&
        (selection.kind !== "load" || selected.kind === "load" && selected.id === selection.id),
      onPointerDown: (event: PointerEvent<SVGGElement>) => {
        if (armed) return;
        event.stopPropagation();
        const branch=selection.kind==="contact"?model.branches?.find(link=>link.id===selection.id):undefined;
        start(event, branch&&branch.to!=="reference"?{bridgeFrom:branch.from,id:branch.id}:
          selection.kind==="contact"?{relocate:selection.id}:movable?{move:selection}:undefined,selection);
      },
      onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect(selection);
        if(timing.current)timing.current.open=false;
        setTray("inspect");
      },
    };
  }
  const number = (value: number) => formatEngineeringNumber(value, language, { significantDigits: 4 });
  const end = nodeX(model.sections.length) + 62;
  const nodeAnchor = junctionX;
  const source = nodeAnchor(model.source.node);
  const load = props.load;
  const symbol = (next: Tool) => typeof next === "string" ? icons[next] : "move" in next ? next.move.kind === "source" ? "±" : icons[next.move.kind] : "relocate" in next && [...model.series??[],...model.branches??[]].find(link=>link.id===next.relocate)?.switch ? icons.switch : "▭";
  const active = preview ? preview.target : hovered;
  const selectedX=selected?.kind==="line"?nodeX(model.sections.findIndex(line=>line.id===selected.id))+85:
    selected?.kind==="source"?source:selected?.kind==="shunt"?nodeAnchor(selected.node):
    selected?.kind==="contact"?nodeX([...model.series??[],...model.branches??[]].find(link=>link.id===selected.id)!.from):end;
  const desktopInspectorLeft=selectedX*view.zoom+view.x<viewport.width/2?undefined:8;
  const snapPoint = active?.edit ? targetPoint(active) : null;
  const canvasBounds = snapPoint ? canvas.current?.getBoundingClientRect() : null;
  const ghost = snapPoint && canvasBounds ? { x: snapPoint.x + canvasBounds.left, y: snapPoint.y + canvasBounds.top } : preview?.point;
  return <div className="network-workspace" onPointerMove={move} onPointerUp={event => finish(event)}
    onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    <div className="network-canvas">
      <div className="network-scheme-tools" role="group" aria-label={t("Управление конструктором", "Керування конструктором")}>
        <button type="button" aria-label={labels.line} aria-pressed={armed === "line"} data-network-tool="line"
          onPointerDown={event => start(event, "line")} onClick={event => { if (event.detail === 0 || !suppress.current) arm("line"); }}><Plus size={18} /> {t("Линия", "Лінія")}</button>
        <button type="button" aria-expanded={tray==="parts"} onClick={()=>toggle("parts")}>{t("Элементы","Елементи")}</button>
        <button type="button" aria-label={t("Отменить изменение","Скасувати зміну")} disabled={!props.canUndo} onClick={()=>{cancel();props.undo();}}><Undo2 size={18}/></button>
        <button type="button" aria-label={t("Повторить изменение","Повторити зміну")} disabled={!props.canRedo} onClick={()=>{cancel();props.redo();}}><Redo2 size={18}/></button>
        <button type="button" aria-label={t("Ещё инструменты и справка","Інші інструменти й довідка")} aria-expanded={tray==="help"} onClick={()=>toggle("help")}><CircleHelp size={18}/></button>
      </div>
      <svg ref={canvas} className="network-schematic" data-network-canvas aria-label={t("Электрическая схема", "Електрична схема")}
        onPointerDown={event => {
          if ((event.target as Element).closest("[data-placement]")) {
            suppress.current = false;
            return;
          }
          start(event);
        }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`} className="network-schematic-drawing">
          <path d={`M${nodeX(0) - 45} 213H${end}`} />
          <path d="M103 29h50l-7-4m7 4l-7 4" /><text x="124" y="22">I</text>
          {model.sections.map((section, index) => {
            const x = nodeX(index), y = layout[section.id] ?? axis;
            return <g key={section.id} data-line-section={section.id} {...object({ kind: "line", id: section.id }, section.id + " · " + t("линия", "лінія"))}>
              <path d={`M${x+(model.series?.some(link=>link.from===index)?15:0)} ${axis}H${x+18}V${y}h14m106 0h14V${axis}H${x+170-(model.series?.some(link=>link.from===index+1)?15:0)}`} />
              <rect x={x + 32} y={y - 12} width="106" height="24" rx="2" />
              <path d={`M${x + 40} ${y - 5}h90m-90 10h90`} />
              <rect className="network-svg-hit" x={x + 31} y={y - 30} width="108" height="60" />
              <text x={x + 34} y={y - 18}>{section.id} · {number(section.impedanceOhm)} Ω</text>
              {view.zoom >= .65 && <text x={x + 36} y={y + 27}>{number(section.lengthM / 1000)} km</text>}
            </g>;
          })}
          {Array.from({ length: model.sections.length + 1 }, (_, index) =>
            <g key={index}><circle className="network-junction" cx={nodeX(index)-(model.series?.some(link=>link.from===index)?15:0)} cy={axis} r="3" />
              <text x={nodeX(index) - 4} y={axis - 17}>{index}</text></g>)}
          <g {...object({ kind: "source" }, t("Источник", "Джерело"))}>
            <path d={`M${source} ${axis}V111m0 22v18m0 40v22`} />
            <rect x={source - 7} y="111" width="14" height="22" /><circle cx={source} cy="171" r="20" />
            <rect className="network-svg-hit" x={source - 23} y="101" width="50" height="98" />
            <text x={source - 4} y="166">+</text><text x={source - 4} y="185">−</text>
            <text x={source + 12} y="127">{number(model.source.resistanceOhm)} Ω</text>
            <text x={source - 12} y="237">{number(model.source.voltageV)} V</text>
          </g>
          {load.children?.length?<g>
            <path d={`M${nodeX(model.sections.length)} ${axis}H${end}V118`}/>
            <LoadCircuit load={load} language={language} onObject={(id,label)=>object({kind:"load",id},label) as React.SVGProps<SVGGElement>}
              region={{x:end-58,y:118,width:116,height:95}}/>
          </g>:<g {...object({ kind: "load" }, t("Нагрузка", "Навантаження"))}>
            <path d={`M${nodeX(model.sections.length)} ${axis}H${end}V149m0 42v22`} />
            {load.kind === "open" ? <><circle cx={end} cy="152" r="3" /><circle cx={end} cy="188" r="3" /></> :
              load.kind === "wire" ? <path d={`M${end} 149v42`} /> :
              load.kind === "c" ? <path d={`M${end} 149v15m-13 0h26m-26 12h26m-13 0v15`} /> :
              load.kind === "l" ? <path d={`M${end} 149v3a9 6 0 0 1 0 12a9 6 0 0 1 0 12a9 6 0 0 1 0 12v3`} /> :
              <rect x={end - 8} y="149" width="16" height="42" />}
            <rect className="network-svg-hit" x={end - 22} y="130" width="48" height="75" />
            <text x={end + 13} y="175">{load.kind === "r" ? number(load.value!) + " Ω" :
              load.kind === "c" ? number(load.value! * 1e6) + " µF" : load.kind === "l" ? number(load.value! * 1e3) + " mH" : "Zₙ"}</text>
          </g>}
          {armed==="r"&&Array.from({length:model.sections.length+1},(_,index)=>
            <g key={index} role="button" tabIndex={0} aria-label={t("Начать перемычку от узла ","Почати перемичку від вузла ")+index}
              onPointerDown={event=>event.stopPropagation()} onClick={()=>arm({bridgeFrom:index})}
              onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();arm({bridgeFrom:index});}}}>
              <circle className="network-svg-hit" cx={nodeAnchor(index)} cy={axis+31} r="22"/><circle cx={nodeAnchor(index)} cy={axis+31} r="12"/><text x={nodeAnchor(index)-6} y={axis+35}>↔</text>
            </g>)}
          {model.series?.map(link=>{
            const x=nodeX(link.from),closed=contactClosed(link,props.time);
            return <g key={link.id} {...object({kind:"contact",id:link.id},link.id+" · "+(link.switch?labels.switch:labels.r))}
              data-contact={link.id} data-closed={link.switch?closed:undefined}>
              {link.switch?<><path d={closed?`M${x-15} ${axis}h30`:`M${x-15} ${axis}l25-15`}/>
                <circle cx={x-15} cy={axis} r="2"/><circle cx={x+15} cy={axis} r="2"/></>:<rect x={x-15} y={axis-6} width="30" height="12"/>}
              <rect className="network-svg-hit" x={x-20} y={axis-22} width="40" height="44"/>
              <text textAnchor="middle" x={x} y={axis-26}>{link.id}{link.resistanceOhm? " · "+number(link.resistanceOhm)+" Ω":""}</text>
            </g>;
          })}
          {model.branches?.map((link,index)=>{
            const from=nodeAnchor(link.from),to=link.to==="reference"?from-23:nodeAnchor(link.to);
            const y=234+index*9,mid=(from+to)/2,closed=contactClosed(link,props.time);
            const left=Math.min(from,to),right=Math.max(from,to);
            const switchX=mid-31;
            return <g key={link.id} {...object({kind:"contact",id:link.id},link.id+" · "+(link.switch?labels.switch:labels.r))}
              data-contact={link.id} data-closed={link.switch?closed:undefined}>
              {link.to==="reference"?<>
                <path d={`M${from} ${axis}H${to}V128 M${to} 174V213`}/>
                {link.switch?<path d={closed?`M${to} 128v20`:`M${to} 128l13 16`}/>:<path d={`M${to} 128v20`}/>}
                <rect x={to-7} y="148" width="14" height="26"/>
                <circle className="network-junction" cx={from} cy={axis} r="3"/><circle className="network-junction" cx={to} cy="213" r="3"/>
                <rect className="network-svg-hit" x={to-17} y="123" width="40" height="55"/>
                <text x={to-18} y="194">{link.id} · {number(link.resistanceOhm!)} Ω</text>
              </>:<>
                <path d={`M${left} ${axis}h26V${y}H${link.switch?switchX-9:mid-15} M${mid+15} ${y}H${right-26}V${axis}h26`} className="network-bridge-wire"/>
                {link.switch&&<><path d={closed?`M${switchX-9} ${y}h25`:`M${switchX-9} ${y}l16-11m9 11h1`}/>
                  <circle cx={switchX-9} cy={y} r="2"/><circle cx={mid-15} cy={y} r="2"/></>}
                <rect x={mid-15} y={y-6} width="30" height="12"/>
                <circle className="network-junction" cx={from} cy={axis} r="3"/><circle className="network-junction" cx={to} cy={axis} r="3"/>
                <rect className="network-svg-hit" x={mid-20} y={y-15} width="40" height="32"/>
                <text x={mid+18} y={y+4}>{link.id} · {number(link.resistanceOhm!)} Ω</text>
              </>}
            </g>;
          })}
          {model.shunts.map(shunt => {
            const x = nodeAnchor(shunt.node) - 33;
            return <g key={shunt.node} {...object({ kind: "shunt", node: shunt.node }, labels.shunt + " · " + shunt.node)}>
              <path d={`M${x + 33} ${axis}H${x}V148m0 30v35`} />
              <rect x={x - 7} y="148" width="14" height="30" /><rect className="network-svg-hit" x={x - 21} y="134" width="44" height="55" />
              <text x={x - 13} y="201">{number(shunt.resistanceOhm)} Ω</text>
            </g>;
          })}
        </g>
        {targets.filter(target=>!(target.kind==="node" && target.error==="choose-connection")).map(target => {
          const point = targetPoint(target);
          const snapped = active?.kind === target.kind && active.index === target.index;
          return <g key={target.kind + target.index} transform={`translate(${point.x} ${point.y})`}
            data-placement={target.kind} data-position={target.index} data-allowed={!!target.edit}
            data-snapped={snapped || undefined} role="button" aria-label={name(target)}
            aria-disabled={!target.edit} tabIndex={target.edit && !preview ? 0 : -1}
            onPointerEnter={()=>{if(armed&&!preview)setHovered(target);}}
            onPointerLeave={()=>setHovered(current=>current===target?null:current)}
            onFocus={()=>{if(armed)setHovered(target);}} onBlur={()=>setHovered(null)}
            onClick={event => { if (event.detail === 0 || !suppress.current) place(target); }}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              place(target);
            }}>
            <circle r="22" className="network-svg-hit" />
            {target.kind === "node" || target.kind==="joint" ? <circle r={snapped ? 9 : 6} /> :
              target.kind === "span" ? <path d="M0-8 8 0 0 8-8 0Z" /> : <rect x="-7" y="-7" width="14" height="14" rx="2" />}
            {snapped && target.edit && typeof tool==="object" && tool && "bridgeFrom" in tool &&
              <path className="network-connection-preview" d={`M0 0v${145*view.zoom}h${(junctionX(tool.bridgeFrom)-junctionX(target.index))*view.zoom}V0`}/>}
            {snapped && target.edit && (target.kind==="branch"||target.kind==="branch-span") && <path className="network-connection-preview" d={`M0 ${(axis-147)*view.zoom}V${(213-147)*view.zoom}`}/>}
            {snapped && target.edit && (target.kind==="joint"||target.kind==="span") && tool!=="shunt" && tool!=="line" &&
              <g className="network-connection-preview"><path d="M-25 0h17m16 0h17"/>
                {tool==="switch"?<path d="M-8 0l13-8"/>:<rect x="-8" y="-4" width="16" height="8"/>}</g>}
            {snapped && target.edit && tool==="shunt" && (target.kind==="span"||target.kind==="node") &&
              <path className="network-connection-preview" d={`M0 0V${(213-axis)*view.zoom}`}/>}
            {snapped && target.edit && (target.kind==="branch"||target.kind==="branch-span"||tool==="shunt") &&
              <><circle r="4" cy={(axis-(target.kind==="branch"||target.kind==="branch-span"?147:axis))*view.zoom}/>
               <circle r="4" cy={(213-(target.kind==="branch"||target.kind==="branch-span"?147:axis))*view.zoom}/></>}
            {snapped && <text y="-16" textAnchor="middle">{zone(target)}</text>}
          </g>;
        })}
      </svg>
      <div className="network-camera">
        <button type="button" onClick={() => setCamera(null)} aria-label={t("Показать всю схему", "Показати всю схему")}><Maximize size={18} /></button>
        <button type="button" disabled={!selected} onClick={center} aria-label={t("Центрировать объект", "Центрувати об’єкт")}><Crosshair size={18} /></button>
      </div>
      <div className="network-placement-status" role="status">{active ? active.edit ? name(active) : explain(active.error) : preview ? explain() : message}</div>
    </div>
    {preview && ghost && <div className="network-drag-ghost" aria-hidden="true" data-invalid={!active?.edit}
      style={{ left: ghost.x, top: Math.min(ghost.y, preview.point.y) - (preview.touch ? 36 : 20) }}>{symbol(preview.tool)}</div>}
    {tray && <div data-dragging={!!preview || undefined} className={`network-tray network-tray-${tray}`} style={tray==="inspect" ? {
      "--inspector-left":desktopInspectorLeft!==undefined?"8px":"auto",
      "--inspector-right":desktopInspectorLeft!==undefined?"auto":"8px",
      ...(visible.inset>0?{bottom:visible.inset+78,maxHeight:Math.max(48,visible.height/2)}:{})
    } as React.CSSProperties : undefined}>
        <button type="button" className="network-tray-close" aria-label={t("Закрыть панель", "Закрити панель")} onClick={() => toggle(null)}><ChevronDown size={18} /></button>
        {tray === "parts" && <div className="network-palette">
          {[parts.slice(0,3), parts.slice(3)].map((group, index) => <div key={index}>
            <strong>{index === 0 ? t("Соединения", "З’єднання") : t("Концевые", "Кінцеві")}</strong><div>{group.map(part =>
              <button type="button" key={part} data-network-tool={part} onPointerDown={event => start(event, part)}
                onClick={event => { if (event.detail === 0 || !suppress.current) arm(part); }}><span aria-hidden="true">{symbol(part)}</span>{labels[part]}</button>)}</div>
          </div>)}
        </div>}
        {tray === "inspect" && (selected ? props.inspector(arm) : <p>{t("Выберите объект на схеме.", "Оберіть об’єкт на схемі.")}</p>)}
        {tray === "help" && <div>
          <div className="network-buttons">{props.tools}</div>
          <strong>{t("Как распространяются волны", "Як поширюються хвилі")}</strong>
          <p>{t("Напряжение U = U⁺ + U⁻, ток I = (U⁺ − U⁻) / Z₀. При согласованной нагрузке R = Z₀ отражённая волна отсутствует.",
            "Напруга U = U⁺ + U⁻, струм I = (U⁺ − U⁻) / Z₀. За узгодженого навантаження R = Z₀ відбита хвиля відсутня.")}</p>
          <a href={props.reference} target="_blank" rel="noopener">{t("Открыть справку в новой вкладке", "Відкрити довідку в новій вкладці")}</a>
        </div>}
    </div>}
    <div className="network-dock" style={{ bottom: visible.inset }}>
      <details className="network-timing" ref={timing}>
        <summary>{t("Время","Час")} · {number(props.time*1000)} {t("мс","мс")}</summary>
        <div>{props.timing}</div>
      </details>
      <div className="network-toolbar" role="group" aria-label={t("Управление симуляцией","Керування симуляцією")}>{props.transport}</div>
    </div>
  </div>;
}
