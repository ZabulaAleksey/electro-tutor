import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { svgPoint } from "../engineering/usePointerStroke";
import type { CircuitBoardExtension } from "../circuit/CircuitEditor";
import type { Drawing, Point } from "../circuit/drawing";
import { archivedAnchors, archivedSelection, detachedTemplate } from "./circuit-archive";
import { DEFAULT_NETWORK, type Network } from "./network";
import { isTwoTerminal, placementTargets, type DetachedPart, type Placement, type Selection, type Tool } from "./network-edit";
import { useLineInk } from "./useLineInk";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const palette = ["line", "wire", "r", "l", "c", "diode", "source", "switch", "shunt"] as const;

type Props = Parameters<typeof useLineInk>[0] & {
  onCommit: (next: Network, selection: Selection, previous?: Selection) => void;
  onProbe: (index: number) => void;
  onContactClosed: (id: string) => boolean | undefined;
  onSelect: (selection: Selection | null) => void;
  selection: Selection | null;
  onDelete: (selection: Selection) => void;
  onDetached: (parts: DetachedPart[]) => void;
  onDetach: (item: Selection, part: DetachedPart) => void;
  inspector: (arm: (tool: Tool) => void) => ReactNode;
};

function placementPoint(drawing: Drawing, model: Network, option: Placement): Point | undefined {
  const anchors = archivedAnchors(drawing);
  if (!anchors) return undefined;
  const station = drawing.junctionPositions[anchors.signal[option.index]];
  if (option.kind === "branch-key" || option.kind === "wire-insert") return drawing.positions[model.branches?.[option.index]?.id ?? ""];
  if (option.kind === "span" || option.kind === "branch-span") {
    const center = drawing.positions[model.sections[option.index]?.id];
    if (!center) return undefined;
    return option.kind === "span" ? center : { ...center, y: center.y + 50 };
  }
  if (!station) return undefined;
  if (option.kind === "branch") return { ...station, x: station.x + 40 };
  if (option.kind === "joint") return { ...station, x: station.x - 35 };
  if (option.kind === "end") return { ...station, x: station.x + 67 };
  return station;
}

export function useLineOperations(props: Props): CircuitBoardExtension {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [hint, setHint] = useState("");
  const [inspect, setInspect] = useState(false);
  const [hover, setHover] = useState<{ client: Point; board: Point; kind: typeof palette[number] } | null>(null);
  const [drag, setDrag] = useState<{ client: Point; board: Point | null; kind: typeof palette[number] } | null>(null);
  const pointer = useRef<{ id: number; start: Point; kind: typeof palette[number]; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const focusTarget = useRef(false);
  const t = (ru: string, uk: string) => props.language === "ru" ? ru : uk;
  const ink = useLineInk(props);
  const { model, empty, detached } = props;
  const labels = {
    line: t("Линия передачи", "Лінія передачі"), wire: t("Провод", "Провід"),
    r: t("Резистор", "Резистор"), l: t("Индуктивность", "Індуктивність"),
    c: t("Конденсатор", "Конденсатор"), diode: t("Диод", "Діод"),
    source: t("Источник", "Джерело"), switch: t("Ключ", "Ключ"), shunt: t("Шунтирующий резистор", "Шунтувальний резистор"),
  };
  function arm(next: Tool, keyboard = false) {
    focusTarget.current = keyboard;
    setTool(next);
    setPaletteOpen(false);
    setHint(t("Выберите подсвеченную точку на схеме.", "Оберіть підсвічену точку на схемі."));
  }
  function cancel() {
    if (pointer.current?.moved) suppressClick.current = true;
    pointer.current = null;
    setHover(null);
    setDrag(null);
    setTool(null);
    setHint("");
  }
  function options(active: Tool) {
    return placementTargets(model, active).filter(option => !empty || active === "line" && option.kind === "end");
  }
  const targets = tool ? options(tool) : [];
  function bridgeFrom(index: number) {
    if (!tool) return arm({ bridgeFrom: index, wire: true });
    if (typeof tool === "string" && isTwoTerminal(tool)) return arm({ bridgeFrom: index, part: tool });
    if (typeof tool === "object" && "relocate" in tool) return arm({ bridgeFrom: index, id: tool.relocate });
    if (typeof tool === "object" && "install" in tool && isTwoTerminal(tool.install.kind)) {
      return arm({ bridgeFrom: index, part: tool.install.kind, template: tool.install.template });
    }
  }
  const firstTerminal = !tool || typeof tool === "string" && isTwoTerminal(tool) ||
    typeof tool === "object" && ("relocate" in tool || "install" in tool && isTwoTerminal(tool.install.kind));
  const targetPoint = (drawing: Drawing, option: Placement) =>
    placementPoint(drawing, model, option) ?? (empty ? { x: 270, y: 180 } : undefined);
  function closest(drawing: Drawing, choices: Placement[], at: Point) {
    return choices.map(option => ({ option, point: targetPoint(drawing, option) }))
      .flatMap(({ option, point }) => point ? [{ option, gap: distance(point, at) }] : [])
      .filter(({ gap }) => gap <= 28).sort((a, b) => a.gap - b.gap)[0]?.option;
  }
  function drop(drawing: Drawing, active: Tool, at: Point) {
    const option = empty && active === "line" ? options(active)[0] : closest(drawing, options(active), at);
    if (option?.edit) { activate(option, active); return; }
    if (option && !drag) { setHint(t("Выберите другой вывод.", "Оберіть інший вивід.")); return; }
    if (!option && typeof active === "string" && active !== "shunt" && active !== "line" && active !== "open" && active !== "matched") {
      let index = 1;
      while (detached.some(part => part.id === "draft-" + index)) index++;
      const id = "draft-" + index;
      const board = drawing.board ?? { width: 540, height: 360 };
      const x = Math.max(40, Math.min(board.width - 40, at.x));
      const y = Math.max(40, Math.min(board.height - 40, at.y));
      props.onDetached([...detached, { id, kind: active, x, y }]);
      props.onSelect({ kind: "detached", id });
      setInspect(true);
    }
    cancel();
  }
  function updateDrag(event: PointerEvent<HTMLButtonElement>, drawing: Drawing, finish = false) {
    const held = pointer.current;
    if (!held || held.id !== event.pointerId) return;
    const client = { x: event.clientX, y: event.clientY };
    held.moved ||= distance(client, held.start) >= 8;
    const svg = event.currentTarget.closest("[data-circuit-editor]")?.querySelector<SVGSVGElement>("[data-circuit-board]");
    const bounds = svg?.getBoundingClientRect();
    const board = svg && bounds && client.x >= bounds.left && client.y >= bounds.top &&
      client.x <= bounds.right && client.y <= bounds.bottom ? svgPoint(svg, client.x, client.y) : null;
    if (!finish) {
      if (held.moved) { setTool(held.kind); setDrag({ client, board, kind: held.kind }); }
      return;
    }
    pointer.current = null;
    if (!held.moved) return;
    suppressClick.current = true;
    if (board) drop(drawing, held.kind, board);
    else cancel();
  }
  function activate(option: Placement, active = tool) {
    if (!option.edit) return;
    const target = option.edit.selection;
    if (target.kind === "load" && !target.id) {
      if ((model.load.children?.length || option.edit.model.events.length < model.events.length) &&
          !window.confirm(t("Заменить нагрузку и связанные события?", "Замінити навантаження і пов’язані події?"))) return;
    }
    const previous: Selection | undefined = active && typeof active === "object"
      ? "install" in active ? { kind: "detached", id: active.install.id }
        : "relocate" in active ? { kind: "contact", id: active.relocate }
          : "moveLoad" in active ? { kind: "load", id: active.moveLoad } : undefined : undefined;
    props.onCommit(empty && active === "line" ? structuredClone(DEFAULT_NETWORK) : option.edit.model,
      empty && active === "line" ? { kind: "line", id: DEFAULT_NETWORK.sections[0].id } : target, previous);
    if (repeat && typeof active === "string") {
      setDrag(null);
      setHover(null);
      setPaletteOpen(false);
    } else cancel();
  }
  function name(option: Placement) {
    const section = model.sections[option.index]?.id;
    switch (option.kind) {
      case "end": return t("Конец линии", "Кінець лінії");
      case "span": return (tool && isTwoTerminal(tool) ? t("В разрыв линии", "У розрив лінії") : t("Вдоль линии", "Уздовж лінії")) + " · " + section;
      case "branch-span": return t("Шунт к опоре", "Шунт до опори") + " · " + section;
      case "branch": return t("Шунт к опоре", "Шунт до опори") + " · " + option.index;
      case "joint": return t("Последовательный стык", "Послідовний стик") + " · " + option.index;
      case "wire-insert": return t("В разрыв провода", "У розрив проводу") + " · " + option.index;
      case "branch-key": return t("Ключ в существующую ветвь", "Ключ у наявну гілку") + " · " + option.index;
      default: return t("Узел соединения", "Вузол з’єднання") + " · " + option.index;
    }
  }

  return {
    onStroke: ink.onStroke,
    placing: !!tool,
    boardTool: true,
    partClosed: props.onContactClosed,
    groundPart: id => id === model.load.id && !!props.layout["@ground-load"],
    onHover: (event, board) => {
      if (!board) { if (hover) setHover(null); return; }
      const kind = palette.find(candidate => candidate === tool);
      if (kind && event.pointerType === "mouse") setHover({ client: { x: event.clientX, y: event.clientY }, board, kind });
    },
    onCancel: () => { cancel(); ink.cancel(); setInspect(false); },
    onBoardClick: id => { if (!id && !tool) { props.onSelect(null); setInspect(false); } },
    describeWire: (id, drawing) => {
      const conductors = drawing.topology.wires;
      const wire = conductors.find(item => item.id === id);
      if (!wire) return {};
      const terminal = [wire.from, wire.to].find(endpoint => /:[ab]$/.test(endpoint));
      if (!terminal) return {};
      const part = terminal.slice(0,-2);
      const selection = archivedSelection(drawing, part);
      if (selection?.kind === "load" && part === model.load.id) return { "data-load-lead": terminal.endsWith(":a") ? 0 : 1 };
      return {};
    },
    describePart: (id, drawing) => {
      const selection = archivedSelection(drawing, id);
      if (selection?.kind === "source") return { "aria-label": labels.source };
      if (selection?.kind === "load" && selection.id === model.load.id) return { "aria-label": t("Нагрузка", "Навантаження") };
      if (selection?.kind === "contact") {
        const kind = drawing.topology.components.find(part => part.id === id)?.kind;
        const label = kind && Object.hasOwn(labels, kind) ? labels[kind as keyof typeof labels] : undefined;
        return { "data-contact": selection.id, ...(label ? { "aria-label": id + " · " + label } : {}) };
      }
      if (selection?.kind === "detached") return { "data-detached": detached.find(part => part.id === id)?.kind };
      return {};
    },
    onSelect: (id, drawing) => {
      const selection = id ? archivedSelection(drawing, id) : null;
      if (selection?.kind === "line") props.onProbe(model.sections.findIndex(line => line.id === selection.id));
      if (selection) {
        props.onSelect(selection.kind === "load" && selection.id === model.load.id ? { kind: "load" } : selection);
        setInspect(true);
      }
    },
    onTap: (point, drawing) => {
      if (!tool) return false;
      drop(drawing, tool, point);
      return true;
    },
    overlay: drawing => {
      const board = drag?.board ?? hover?.board;
      const activeTarget = board ? closest(drawing, targets, board) : undefined;
      return <>
      {archivedAnchors(drawing)?.signal.map((id, index) => {
        const point = drawing.junctionPositions[id];
        if (!point) return null;
        const first = typeof tool === "object" && tool && "bridgeFrom" in tool && tool.bridgeFrom === index;
        return <g key={id} className={first ? "network-first-terminal" : undefined} data-line-node={index}>
          <circle className="network-junction" cx={point.x} cy={point.y} r="5" pointerEvents="none" />
          {firstTerminal && !ink.active && <circle cx={point.x} cy={point.y} r="11" fill="transparent" data-line-start role="button" tabIndex={0}
            aria-label={t("Начать перемычку от узла ", "Почати перемичку від вузла ") + index}
            onClick={()=>bridgeFrom(index)}
            onKeyDown={event=>{if(event.key==="Enter" || event.key===" "){event.preventDefault();bridgeFrom(index);}}}/>}
        </g>;
      })}
      {ink.overlay?.(drawing)}
      {tool && targets.map(option => {
        const point = targetPoint(drawing, option);
        const snapped = activeTarget === option;
        if (!option.edit && !snapped) return null;
        if (!point) return null;
        return <g key={option.kind + option.index} className="circuit-target" transform={`translate(${point.x} ${point.y})`}
          data-placement={option.kind} data-position={option.index} data-allowed={!!option.edit} data-snapped={snapped || undefined}
          ref={element => { if (element && option.edit && focusTarget.current) { focusTarget.current = false; element.focus(); } }}
          role="button" tabIndex={0} aria-label={name(option)} onClick={event => { if (event.detail === 0) activate(option); }}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(option); }
          }}><circle r="17" fill="transparent" /><circle r="6" /></g>;
      })}
    </>;
    },
    onCopy: (id, drawing, position) => {
      const part = drawing.topology.components.find(part => part.id === id);
      const template = part && detachedTemplate(part);
      if (!template) return false;
      let index = 1;
      while (detached.some(part => part.id === "draft-" + index)) index++;
      const draftId = "draft-" + index;
      props.onDetached([...detached, { ...template, id: draftId, ...position }]);
      props.onSelect({ kind: "detached", id: draftId });
      setInspect(true);
      return true;
    },
    controls: drawing => {
      const anchors = archivedAnchors(drawing);
      const floating = drag ?? hover;
      return <>
        <div className="circuit-toolbar circuit-line-tools" role="group" aria-label={t("Управление конструктором", "Керування конструктором")}>
          <button type="button" aria-expanded={paletteOpen} onClick={() => setPaletteOpen(value => !value)}>
            {t("Элементы", "Елементи")}
          </button>
          {paletteOpen && <label><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />
            {t("Добавлять несколько", "Додавати кілька")}</label>}
          {paletteOpen && palette.map(kind => <button type="button" key={kind} data-network-tool={kind}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary) return;
              suppressClick.current = false;
              pointer.current = { id: event.pointerId, kind, start: { x: event.clientX, y: event.clientY }, moved: false };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => updateDrag(event, drawing)}
            onPointerUp={event => updateDrag(event, drawing, true)}
            onPointerCancel={cancel}
            onClick={event => { if (!suppressClick.current || event.detail === 0) arm(kind, event.detail === 0); }}>
            {labels[kind]}
          </button>)}
          {floating && <div className="network-drag-ghost" aria-hidden="true"
            style={{ left: floating.client.x, top: floating.client.y - 50 }}>{labels[floating.kind]}</div>}
          {tool && <button type="button" onClick={cancel}>{t("Отменить размещение", "Скасувати розміщення")}</button>}
          {!tool && anchors && <label>{t("Перемычка от узла", "Перемичка від вузла")} <select value="" onChange={event => {
            if (event.target.value) arm({ bridgeFrom: Number(event.target.value), wire: true });
          }}><option value="">—</option>{anchors.signal.map((id, index) => <option key={id} value={index}>{index}</option>)}</select></label>}
          {hint && <span role="status">{hint}</span>}
        </div>
        {ink.controls(drawing)}
      </>;
    },
    inspector: (drawing, id) => {
      const selection = id ? archivedSelection(drawing, id) : props.selection;
      const part = selection?.kind === "detached" ? detached.find(item => item.id === selection.id) : undefined;
      return <>
        {(id || selection) && <div className="circuit-toolbar">
          {part && <><button type="button" onClick={() => arm({ install: part })}>{t("Подключить", "Під’єднати")}</button>
            <button type="button" onClick={() => props.onDelete(selection!)}>{t("Удалить черновик", "Видалити чернетку")}</button></>}
          <button type="button" onClick={() => setInspect(true)}>{t("Параметры", "Параметри")}</button>
          {selection && selection.kind !== "source" && selection.kind !== "detached" && <button type="button" onClick={() => {
            const component = drawing.topology.components.find(item => item.id === id);
            const template = component && detachedTemplate(component);
            if (!template || !id) return;
            let index = 1;
            while (detached.some(item => item.id === "draft-" + index)) index++;
            const { x, y, rotation } = drawing.positions[id];
            props.onDetach(selection, { ...template, id: "draft-" + index, x, y, rotation });
          }}>{t("Отсоединить", "Від’єднати")}</button>}
        </div>}
        {inspect && <div className="circuit-lab-inspector" data-line-inspector>
          <button type="button" className="network-tray-close" onClick={() => setInspect(false)}>{t("Закрыть панель", "Закрити панель")}</button>
          {props.selection?.kind === "detached" ? <p>{t("Не подключён к схеме", "Не під’єднано до схеми")}</p> : props.inspector(arm)}
        </div>}
      </>;
    },
  };
}
