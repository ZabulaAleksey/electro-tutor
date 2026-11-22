import { useId, useMemo, useState } from "react";
import { CapacitorGlyph, InductorGlyph, ResistorGlyph, TextbookSourceGlyph } from "../engineering/symbols";
import type { Language } from "../types";
import { parts } from "./drawing";
import { layoutTopology } from "./topology-layout";
import { TopologySession } from "./topology-session";
import { listTopologySlots, type TopologySide, type TopologySlot } from "./topology-slots";
import { netlist, type CircuitComponent } from "./topology";
import { useTopologyViewport } from "./use-topology-viewport";
import "./topology-workbench.css";

const productParts = ["r", "l", "c", "voltage", "current", "switch-open", "switch-closed", "line"] as const;
type ProductPart = typeof productParts[number];
const presets = ["e3", "1", "10", "50", "200"] as const;
type Preset = typeof presets[number];
const modes = ["parallel", "series", "cross"] as const;
type Mode = typeof modes[number];
type PickedSlot = Exclude<TopologySlot, { kind: "cross" }>;
const pageSize = 24;

const copy = {
  ru: {
    title: "Топологическая схема",
    intro: "Выберите соединение и добавьте элемент. Схема перестроится автоматически.",
    example: "Пример", reference: "Эталон E3", elements: "Элементов",
    board: "Схема", boardControls: "Масштаб схемы", boardPan: "Поле схемы, прокрутка стрелками",
    boardHelp: "Перемещайте поле касанием или прокруткой. Для масштаба используйте кнопки, Ctrl и колесо или жест двумя пальцами.",
    zoomIn: "Увеличить", zoomOut: "Уменьшить", zoomReset: "Сбросить масштаб",
    insertTitle: "Вставка элемента", part: "Элемент", method: "Способ подключения",
    methods: { parallel: "Параллельно", series: "Последовательно", cross: "Поперёк" },
    context: "Элемент в группе", target: "Группа", wire: "Провод", side: "Сторона ветви",
    left: "Левая", right: "Правая", from: "От вывода", to: "К выводу",
    empty: "Нет доступных соединений", previous: "Предыдущие группы", next: "Следующие группы",
    insert: "Вставить", insertHere: "Вставить в выбранное соединение", undo: "Отменить", redo: "Повторить", export: "Экспорт JSON",
    added: "Добавлен элемент", failed: "Вставка отклонена. Проверьте выбранное соединение и предел схемы.",
    labels: { r: "Резистор", l: "Катушка", c: "Конденсатор", voltage: "Источник ЭДС",
      current: "Источник тока", "switch-open": "Замыкающий ключ", "switch-closed": "Размыкающий ключ", line: "Длинная линия" },
    open: "НО", closed: "НЗ",
  },
  uk: {
    title: "Топологічна схема",
    intro: "Оберіть з’єднання та додайте елемент. Схема перебудується автоматично.",
    example: "Приклад", reference: "Еталон E3", elements: "Елементів",
    board: "Схема", boardControls: "Масштаб схеми", boardPan: "Поле схеми, прокручування стрілками",
    boardHelp: "Переміщуйте поле дотиком або прокручуванням. Для масштабу використовуйте кнопки, Ctrl і колесо або жест двома пальцями.",
    zoomIn: "Збільшити", zoomOut: "Зменшити", zoomReset: "Скинути масштаб",
    insertTitle: "Вставлення елемента", part: "Елемент", method: "Спосіб підключення",
    methods: { parallel: "Паралельно", series: "Послідовно", cross: "Поперек" },
    context: "Елемент у групі", target: "Група", wire: "Провід", side: "Бік гілки",
    left: "Лівий", right: "Правий", from: "Від виводу", to: "До виводу",
    empty: "Немає доступних з’єднань", previous: "Попередні групи", next: "Наступні групи",
    insert: "Вставити", insertHere: "Вставити у вибране з’єднання", undo: "Скасувати", redo: "Повторити", export: "Експорт JSON",
    added: "Додано елемент", failed: "Вставлення відхилено. Перевірте вибране з’єднання та межу схеми.",
    labels: { r: "Резистор", l: "Котушка", c: "Конденсатор", voltage: "Джерело ЕРС",
      current: "Джерело струму", "switch-open": "Замикаючий ключ", "switch-closed": "Розмикаючий ключ", line: "Довга лінія" },
    open: "НР", closed: "НЗ",
  },
} as const;

const prefixes: Record<ProductPart, string> = {
  r: "R", l: "L", c: "C", voltage: "E", current: "J", "switch-open": "K", "switch-closed": "K", line: "TL",
};
const units = { r: ["ohm", "Ω", 1], l: ["henry", "H", 1], c: ["farad", "µF", 1e6],
  voltage: ["voltageV", "V", 1], current: ["currentA", "A", 1], line: ["lengthM", "km", 0.001] } as const;

function newPart(part: ProductPart, id: string): CircuitComponent {
  const kind = part === "switch-open" || part === "switch-closed" ? "switch" : part;
  const parameters = kind === "switch"
    ? { ...parts.switch.parameters, closed: part === "switch-closed", closes: part === "switch-open" }
    : parts[kind].parameters;
  return { id, kind, terminals: [id + ":a", id + ":b"], parameters };
}

function example(count: number) {
  const components = Array.from({ length: count }, (_, index) => {
    const part = productParts[index % productParts.length];
    return newPart(part, prefixes[part] + String(index + 1).padStart(String(count).length, "0"));
  });
  const wires = components.slice(1).map((next, index) => ({
    id: "w" + (index + 1), from: components[index].terminals[1], to: next.terminals[0],
  }));
  return JSON.stringify({ kind: "electrotutor-topology-lab", schemaVersion: 1,
    topology: { components, wires, junctions: [] }, observedEndpoints: [], attachmentSides: [] });
}

function nextComponent(session: TopologySession, part: ProductPart) {
  const graph = session.document.topology;
  const used = new Set([
    ...graph.components.flatMap(({ id, terminals }) => [id, ...terminals]),
    ...graph.junctions, ...graph.wires.map(({ id }) => id),
  ]);
  const prefix = prefixes[part];
  let index = 1;
  while ([prefix + index, prefix + index + ":a", prefix + index + ":b"].some((id) => used.has(id))) index++;
  return newPart(part, prefix + index);
}

function compact(value: string, limit: number) {
  return value.length > limit ? value.slice(0, limit - 1) + "…" : value;
}

function partKind(part: CircuitComponent) {
  if (part.kind !== "switch") return part.kind;
  return part.parameters.closed === false ? "switch-open" : "switch-closed";
}

function valueText(part: CircuitComponent, locale: Language) {
  if (part.kind === "switch") return part.parameters.closed === false ? copy[locale].open : copy[locale].closed;
  const unit = units[part.kind as keyof typeof units];
  const nominal = unit && part.parameters[unit[0]];
  if (typeof nominal !== "number") return "";
  const value = nominal * unit[2];
  const format = new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 3,
    notation: Math.abs(value) >= 10_000 || value !== 0 && Math.abs(value) < 0.001 ? "scientific" : "standard",
  });
  return format.format(Number.isFinite(value) ? value : nominal) + " " + (Number.isFinite(value) ? unit[1] : "F");
}

function Glyph({ component }: { component: CircuitComponent }) {
  switch (component.kind) {
    case "r": return <ResistorGlyph x={-52} y={0} terminalSpan={104} />;
    case "c": return <CapacitorGlyph x={0} y={0} orientation="horizontal" terminalSpan={104} />;
    case "l": return <><path className="topology-stroke" d="M-52 0H-27M27 0H52" /><InductorGlyph x={-27} y={0} /></>;
    case "voltage":
    case "current":
      return <>
        <path className="topology-stroke" d="M-52 0H-22M22 0H52" />
        <TextbookSourceGlyph x={0} y={0} kind={component.kind === "voltage" ? "emf" : "current"} />
      </>;
    case "line":
      return <><path className="topology-stroke" d="M-52 0H52" /><path className="topology-long-line" d="M-37 0H37" /></>;
    case "switch": {
      const open = component.parameters.closed === false;
      return <g className="topology-stroke">
        <path d={open ? "M-52 0H-18L13 -16M18 0H52" : "M-52 0H-18L18 0H52"} />
        <circle cx={-18} cy={0} r={3} /><circle cx={18} cy={0} r={3} />
      </g>;
    }
    default: return <path className="topology-stroke" d="M-52 0H-18M18 0H52M-18 -13H18V13H-18Z" />;
  }
}

function exportDocument(session: TopologySession) {
  const url = URL.createObjectURL(new Blob([session.export()], { type: "application/json" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = "electrotutor-topology.json";
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TopologyWorkbench({ language, referenceJson }: { language: Language; referenceJson: string }) {
  const t = copy[language];
  const [preset, setPreset] = useState<Preset>("e3");
  const [sessions] = useState(() => new Map<Preset, TopologySession>([["e3", new TopologySession(referenceJson)]]));
  const [revision, refresh] = useState(0);
  const [mode, setMode] = useState<Mode>("parallel");
  const [part, setPart] = useState<ProductPart>("r");
  const [side, setSide] = useState<TopologySide>("left");
  const [context, setContext] = useState("");
  const [target, setTarget] = useState("");
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string }>();
  const id = useId();
  const { viewportRef, zoom, zoomIn, zoomOut, resetZoom, viewportEvents } = useTopologyViewport();
  const session = sessions.get(preset)!;
  const circuit = session.document;
  const graph = circuit.topology;
  const layout = useMemo(() => layoutTopology(circuit), [circuit]);
  const slots = useMemo(() => listTopologySlots(graph, circuit.observedEndpoints), [graph, circuit.observedEndpoints]);
  const junctions = useMemo(() => {
    const degree = new Map<string, number>();
    for (const { from, to } of graph.wires) {
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(to, (degree.get(to) ?? 0) + 1);
    }
    const terminalJoins = graph.components.flatMap(({ terminals }) => terminals.flatMap((id) => {
      const point = layout.endpoints.get(id);
      return point && (degree.get(id) ?? 0) > 1 ? [{ id, ...point }] : [];
    }));
    return [...layout.junctions, ...terminalJoins];
  }, [graph, layout]);
  const devices = useMemo(() => new Map(graph.components.map((component) => [component.id, component])), [graph]);
  const wires = useMemo(() => new Map(graph.wires.map((wire) => [wire.id, wire])), [graph]);
  const nodes = useMemo(() => new Map(netlist(graph).flatMap((net, index) => net.map((key) => [key, index] as const))), [graph]);
  const endpoints = [...nodes.keys()].sort();
  const actualContext = devices.has(context) ? context : graph.components[0]?.id ?? "";
  const actualFrom = nodes.has(from) ? from : endpoints[0] ?? "";
  const ends = endpoints.filter((endpoint) => nodes.get(endpoint) !== nodes.get(actualFrom));
  const actualTo = ends.includes(to) ? to : ends[0] ?? "";
  const choices = useMemo(() => slots.filter((slot): slot is PickedSlot =>
    mode === "series" && slot.kind === "series"
      || mode === "parallel" && slot.kind === "parallel" && slot.side === side && slot.componentIds.includes(actualContext)),
  [slots, mode, side, actualContext]);
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const actualPage = Math.min(page, pageCount - 1);
  const visibleChoices = choices.slice(actualPage * pageSize, (actualPage + 1) * pageSize);
  const targetId = (slot: PickedSlot) => slot.kind === "series" ? slot.wireId : slot.id;
  const selected = mode === "cross" && actualFrom && actualTo
    ? session.crossSlot(actualFrom, actualTo)
    : visibleChoices.find((slot) => targetId(slot) === target) ?? visibleChoices[0];
  const boundary = new Set(selected?.boundaries);
  const highlighted = new Set(selected?.kind === "parallel" ? selected.componentIds : []);
  const anchorOwner = selected?.kind === "parallel" ? actualContext
    : selected?.boundaries.map((endpoint) => layout.anchors.has(endpoint) ? endpoint
      : graph.components.find(({ terminals }) => terminals.includes(endpoint))?.id).find(Boolean);
  const markerSide = selected?.kind === "parallel" ? selected.side : "left";
  const marker = anchorOwner ? layout.anchors.get(anchorOwner)?.[markerSide] : undefined;
  const sheetWidth = layout.width * zoom;
  const sheetHeight = layout.height * zoom;

  function resetChoice() {
    setTarget("");
    setPage(0);
  }

  function changePreset(next: Preset) {
    if (!sessions.has(next)) sessions.set(next, new TopologySession(example(Number(next))));
    setPreset(next);
    setContext("");
    setFrom("");
    setTo("");
    resetChoice();
    resetZoom();
    setNotice(undefined);
  }

  function insert() {
    if (!selected) return;
    try {
      const component = nextComponent(session, part);
      session.apply({ type: "insert", slot: selected, component });
      refresh((value) => value + 1);
      resetChoice();
      setNotice({ kind: "success", message: t.added + " " + component.id });
    } catch {
      setNotice({ kind: "error", message: t.failed });
    }
  }

  function restore(direction: "undo" | "redo") {
    if (!session[direction]()) return;
    refresh((value) => value + 1);
    resetChoice();
    setNotice(undefined);
  }

  return <section className="topology-workbench" data-topology-workbench data-topology-revision={revision}>
    <header className="topology-heading">
      <div><h1>{t.title}</h1><p>{t.intro}</p></div>
      <label className="topology-field topology-preset">{t.example}
        <select data-topology-preset data-topology-hit value={preset} onChange={(event) => changePreset(event.target.value as Preset)}>
          {presets.map((value) => <option key={value} value={value}>{value === "e3" ? t.reference : t.elements + " " + value}</option>)}
        </select>
      </label>
    </header>

    <div className="topology-workspace">
      <section className="topology-board" aria-label={t.board}>
        <header className="topology-board-header">
          <h2>{t.board}</h2>
          <div className="topology-zoom" role="group" aria-label={t.boardControls}>
            <button type="button" data-topology-zoom-out data-topology-hit aria-label={t.zoomOut} onClick={zoomOut}>−</button>
            <button type="button" data-topology-zoom-reset data-topology-hit aria-label={t.zoomReset} onClick={resetZoom}>
              <span data-topology-zoom={zoom}>{Math.round(zoom * 100)}%</span>
            </button>
            <button type="button" data-topology-zoom-in data-topology-hit aria-label={t.zoomIn} onClick={zoomIn}>+</button>
          </div>
        </header>
        <div className="topology-viewport" data-topology-viewport ref={viewportRef} tabIndex={0}
          aria-label={t.boardPan} aria-describedby={id + "-board-help"} {...viewportEvents}>
          <div className="topology-sheet" style={{ width: sheetWidth, height: sheetHeight }}>
            <svg data-topology-svg role="img" aria-label={t.board}
              width={sheetWidth} height={sheetHeight} viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {layout.wires.map(({ id, points }) => {
                const wire = wires.get(id)!;
                const active = selected?.kind === "series" ? selected.wireId === id : boundary.has(wire.from) || boundary.has(wire.to);
                return <polyline key={id} className={active ? "topology-wire topology-wire-active" : "topology-wire"}
                  data-topology-wire={id} points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />;
              })}
              {layout.components.map(({ id, x, y }) => {
                const component = devices.get(id)!;
                const kind = partKind(component);
                const nominal = valueText(component, language);
                return <g key={id} data-topology-component={id} data-topology-kind={kind}
                  data-topology-highlighted={highlighted.has(id) || undefined} transform={`translate(${x} ${y})`}>
                  <title>{id + " · " + (t.labels[kind as ProductPart] ?? component.kind) + (nominal ? " · " + nominal : "")}</title>
                  {highlighted.has(id) && <rect className="topology-glyph-highlight" x={-58} y={-37} width={116} height={75} rx={9} />}
                  <Glyph component={component} />
                  <text className="topology-component-name" x={0} y={-26}>{compact(id, 12)}</text>
                  {nominal && <text className="topology-component-value" x={0} y={37}>{compact(nominal, 15)}</text>}
                </g>;
              })}
              {junctions.map(({ id, x, y }) =>
                <circle key={id} data-topology-junction={id} className="topology-junction" cx={x} cy={y} r={4}>
                  <title>{id}</title>
                </circle>
              )}
              {selected?.boundaries.map((endpoint) => {
                const position = layout.endpoints.get(endpoint);
                return position && <circle key={endpoint} data-topology-boundary={endpoint} className="topology-boundary"
                  cx={position.x} cy={position.y} r={7} />;
              })}
              {marker && <g data-topology-slot-marker={selected?.kind === "parallel" ? markerSide : selected?.kind} transform={`translate(${marker.x} ${marker.y})`}>
                <circle r={8} className="topology-marker" />
                <path className="topology-marker-plus" d="M-4 0H4M0 -4V4" />
              </g>}
            </svg>
            {marker && <button className="topology-slot-action" type="button" data-topology-slot-insert data-topology-hit
              style={{ left: marker.x * zoom, top: marker.y * zoom }} aria-label={t.insertHere}
              onClick={insert}>+</button>}
          </div>
        </div>
        <div className="topology-board-footer">
          <span data-topology-count={graph.components.length}>{t.elements} {graph.components.length}</span>
          <span id={id + "-board-help"}>{t.boardHelp}</span>
        </div>
      </section>

      <section className="topology-insertion" aria-label={t.insertTitle}>
        <h2>{t.insertTitle}</h2>
        <label className="topology-field">{t.part}
          <select data-topology-part data-topology-hit value={part} onChange={(event) => setPart(event.target.value as ProductPart)}>
            {productParts.map((value) => <option key={value} value={value}>{t.labels[value]}</option>)}
          </select>
        </label>
        <label className="topology-field">{t.method}
          <select data-topology-mode data-topology-hit value={mode} onChange={(event) => {
            setMode(event.target.value as Mode);
            resetChoice();
          }}>
            {modes.map((value) => <option key={value} value={value}>{t.methods[value]}</option>)}
          </select>
        </label>
        {mode === "parallel" && <>
          <label className="topology-field">{t.context}
            <select data-topology-context data-topology-hit value={actualContext} onChange={(event) => {
              setContext(event.target.value);
              resetChoice();
            }}>
              {graph.components.map((component) => <option key={component.id}>{component.id}</option>)}
            </select>
          </label>
          <label className="topology-field">{t.side}
            <select data-topology-side data-topology-hit value={side} onChange={(event) => {
              setSide(event.target.value as TopologySide);
              resetChoice();
            }}>
              <option value="left">{t.left}</option><option value="right">{t.right}</option>
            </select>
          </label>
        </>}
        {mode === "cross" ? <>
          <label className="topology-field">{t.from}
            <select data-topology-from data-topology-hit value={actualFrom} onChange={(event) => {
              setFrom(event.target.value);
              setTo("");
            }}>
              {endpoints.map((endpoint) => <option key={endpoint}>{endpoint}</option>)}
            </select>
          </label>
          <label className="topology-field">{t.to}
            <select data-topology-to data-topology-hit value={actualTo} disabled={!ends.length} onChange={(event) => setTo(event.target.value)}>
              {!ends.length && <option value="">{t.empty}</option>}
              {ends.map((endpoint) => <option key={endpoint}>{endpoint}</option>)}
            </select>
          </label>
        </> : <>
          <label className="topology-field">{mode === "series" ? t.wire : t.target}
            <select data-topology-target data-topology-hit
              value={selected && selected.kind !== "cross" ? targetId(selected) : ""} disabled={!visibleChoices.length}
              onChange={(event) => setTarget(event.target.value)}>
              {!visibleChoices.length && <option value="">{t.empty}</option>}
              {visibleChoices.map((slot) => <option key={slot.id} value={targetId(slot)}>
                {slot.kind === "series"
                  ? slot.boundaries.join(" — ")
                  : slot.componentIds.length === 1
                    ? slot.componentIds[0]
                    : `${slot.boundaries[0]} → ${slot.boundaries[1]} · ${slot.componentIds.length}`}
              </option>)}
            </select>
          </label>
          {pageCount > 1 && <div className="topology-page">
            <button type="button" data-topology-hit aria-label={t.previous} disabled={actualPage === 0} onClick={() => {
              setPage(actualPage - 1); setTarget("");
            }}>‹</button>
            <span>{actualPage + 1} / {pageCount}</span>
            <button type="button" data-topology-hit aria-label={t.next} disabled={actualPage + 1 === pageCount} onClick={() => {
              setPage(actualPage + 1); setTarget("");
            }}>›</button>
          </div>}
        </>}
        <button className="topology-primary" type="button" data-topology-insert data-topology-hit disabled={!selected} onClick={insert}>{t.insert}</button>
        <div className="topology-history">
          <button type="button" data-topology-undo data-topology-hit disabled={!session.canUndo} onClick={() => restore("undo")}>{t.undo}</button>
          <button type="button" data-topology-redo data-topology-hit disabled={!session.canRedo} onClick={() => restore("redo")}>{t.redo}</button>
          <button type="button" data-topology-export data-topology-hit onClick={() => exportDocument(session)}>{t.export}</button>
        </div>
        {notice && <p className="topology-notice" role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>}
      </section>
    </div>
  </section>;
}
