import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Language } from "../types";
import { netlist, type CircuitComponent } from "../circuit/topology";
import { parts, type PartKind } from "../circuit/drawing";
import type { Point } from "../circuit/topology-layout";
import { listTopologySlots, type TopologySide, type TopologySlot } from "../circuit/topology-slots";
import { parseTopologyLabDocument, TopologySession, type TopologyLabDocument } from "../circuit/topology-session";
import { useTopologyViewport } from "../circuit/use-topology-viewport";
import { CapacitorGlyph, InductorGlyph, ResistorGlyph, TextbookSourceGlyph } from "../engineering/symbols";
import { layoutLineExperiment, wireTarget } from "./line-experiment-layout";
import "./LineExperimentEditor.css";

type Props = {
  language: Language;
  document: TopologyLabDocument;
  onChange: (next: TopologyLabDocument) => void;
  onAppendSection: () => void;
  onRemove: (id: string) => void;
  onOpenSection: (id: string) => void;
};

const palette = [
  ["r", "r", "R"], ["l", "l", "L"], ["c", "c", "C"], ["voltage", "voltage", "E"],
  ["current", "current", "J"], ["switch-open", "switch", "K"], ["switch-closed", "switch", "K"],
] as const satisfies readonly (readonly [string, PartKind, string])[];
type PaletteItem = typeof palette[number];
type SlotMode = TopologySlot["kind"];
type ParallelSlot = Extract<TopologySlot, { kind: "parallel" }>;

const copy = {
  ru: {
    board: "Схема опыта", palette: "Элементы схемы", append: "Добавить линию справа",
    names: ["Резистор", "Катушка", "Конденсатор", "Источник ЭДС", "Источник тока", "Замыкающий ключ", "Размыкающий ключ"],
    modes: { series: "Последовательно", parallel: "Параллельно", cross: "Между узлами" },
    search: { series: "Выберите участок провода.", parallel: "Выберите элемент или два крайних элемента группы.", cross: "Выберите два вывода или узла." },
    add: "Вставить", open: "Открыть опыт для", select: "Выбрать",
    left: "Вставить ветвь с левой стороны", right: "Вставить ветвь с правой стороны",
    alternate: "Следующий путь между элементами", time: "Время коммутации, с", closeTime: "Время замыкания, с",
    remove: "Удалить элемент", confirm: "Удалить", cancel: "Отмена", invalid: "Здесь вставка недоступна.",
    empty: "На схеме нет подходящего участка.", zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Вернуть масштаб 100%",
  },
  uk: {
    board: "Схема досліду", palette: "Елементи схеми", append: "Додати лінію справа",
    names: ["Резистор", "Котушка", "Конденсатор", "Джерело ЕРС", "Джерело струму", "Замикаючий ключ", "Розмикаючий ключ"],
    modes: { series: "Послідовно", parallel: "Паралельно", cross: "Між вузлами" },
    search: { series: "Виберіть ділянку проводу.", parallel: "Виберіть елемент або два крайні елементи групи.", cross: "Виберіть два виводи або вузли." },
    add: "Вставити", open: "Відкрити дослід для", select: "Вибрати",
    left: "Вставити гілку з лівого боку", right: "Вставити гілку з правого боку",
    alternate: "Наступний шлях між елементами", time: "Час комутації, с", closeTime: "Час замикання, с",
    remove: "Видалити елемент", confirm: "Видалити", cancel: "Скасувати", invalid: "Тут вставка недоступна.",
    empty: "На схемі немає придатної ділянки.", zoomIn: "Збільшити", zoomOut: "Зменшити", reset: "Повернути масштаб 100%",
  },
} as const;

function makePart(topology: TopologyLabDocument["topology"], [choice, kind, prefix]: PaletteItem): CircuitComponent {
  const graphIds = new Set([...topology.junctions, ...topology.wires.map(({ id }) => id),
    ...topology.components.flatMap(({ id, terminals }) => [id, ...terminals])]);
  let index = 1;
  while ([prefix + index, prefix + index + ":a", prefix + index + ":b"].some(id => graphIds.has(id))) index++;
  const id = prefix + index;
  const parameters = kind === "switch" ? { ...parts.switch.parameters, closed: choice === "switch-closed", closes: choice === "switch-open" }
    : { ...parts[kind].parameters };
  return { id, kind, parameters, terminals: [id + ":a", id + ":b"] };
}

function LineGlyph({ part, paired }: { part: CircuitComponent; paired: boolean }) {
  switch (part.kind) {
    case "r": return <ResistorGlyph x={-52} y={0} terminalSpan={104} />;
    case "l": return <><path d="M-52 0H-27M27 0H52" /><InductorGlyph x={-27} y={0} /></>;
    case "c": return <CapacitorGlyph x={0} y={0} orientation="horizontal" terminalSpan={104} />;
    case "voltage":
    case "current": return <>
      <path d="M-52 0H-22M22 0H52" />
      <TextbookSourceGlyph x={0} y={0} kind={part.kind === "current" ? "current" : "emf"} />
    </>;
    case "switch": return <>
      <path d={part.parameters.closed === false ? "M-52 0H-18L15 -17M18 0H52" : "M-52 0H52"} />
      <circle cx={-18} r={3} /><circle cx={18} r={3} />
    </>;
    case "line": return <>
      <path d="M-52 0H52" />
      <path className="line-experiment-conductor" d={paired ? "M-48 0H48M-48 148H48" : "M-42 -8H42M-42 8H42"} />
      {paired && <path className="line-experiment-electric-field" d="M-48 6V142M48 6V142" />}
    </>;
    default: return <path d="M-52 0H-18M18 0H52M-18 -13H18V13H-18Z" />;
  }
}

function SwitchTime({ part, label, onSave }: { part: CircuitComponent; label: string; onSave: (seconds: number) => void }) {
  const seconds = Number(part.parameters.atS ?? 0);
  const [value, setValue] = useState(String(seconds));
  return <label className="line-experiment-time">{label}
    <input data-line-switch-time type="number" min={0} max={10} step="any" inputMode="decimal"
      aria-label={label} value={value} onChange={event => setValue(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
      onBlur={event => {
        const next = event.currentTarget.valueAsNumber;
        if (!event.currentTarget.validity.valid || !Number.isFinite(next)) { setValue(String(seconds)); return; }
        if (next !== seconds) onSave(next);
      }} />
  </label>;
}

type CanvasButtonProps = React.ComponentPropsWithoutRef<"button"> & { point: Point; fieldScale: number; children?: ReactNode };

function CanvasButton({ point, fieldScale, className, children, ...props }: CanvasButtonProps) {
  const style: CSSProperties = { left: point.x * fieldScale, top: point.y * fieldScale };
  return <button type="button" className={["line-experiment-target", className].filter(Boolean).join(" ")}
    style={style} {...props}>{children}</button>;
}

function componentBoundary(slot: ParallelSlot, id: string) {
  return slot.componentIds[0] === id || slot.componentIds.at(-1) === id;
}

export default function LineExperimentEditor({ language, document, onChange, onAppendSection, onRemove, onOpenSection }: Props) {
  const t = copy[language];
  const [armed, setArmed] = useState<PaletteItem>();
  const [mode, setMode] = useState<SlotMode>("series");
  const [selected, setSelected] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [alternate, setAlternate] = useState(0);
  const [endpoint, setEndpoint] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [hasError, setError] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const modeControls = useRef<HTMLDivElement>(null);
  const paletteControls = useRef<HTMLDivElement>(null);
  const { viewportRef, zoom, zoomIn, zoomOut, resetZoom, viewportEvents } = useTopologyViewport();

  const { topology } = document;
  const diagram = useMemo(() => layoutLineExperiment(document), [document]);
  const devices = useMemo(() => new Map(topology.components.map(part => [part.id, part])), [topology]);
  const slots = useMemo(() => listTopologySlots(topology, document.observedEndpoints), [topology, document.observedEndpoints]);
  const parallel = useMemo(() => slots.filter((slot): slot is ParallelSlot =>
    slot.kind === "parallel" && slot.side === "left"), [slots]);
  const selectedPart = devices.get(selected);
  const fit = viewportWidth ? Math.min(1, Math.max(.65, viewportWidth / diagram.width)) : 1;
  const fieldScale = fit * zoom;
  // Choose group boundaries on the actual circuit. A closed loop can expose
  // two paths with the same end components, so both remain selectable.
  const groupPaths = useMemo(() => first ? parallel.filter(slot =>
    last ? componentBoundary(slot, first) && componentBoundary(slot, last)
      : slot.componentIds.length === 1 && slot.componentIds[0] === first) : [], [first, last, parallel]);
  const activeGroup = groupPaths.length ? groupPaths[alternate % groupPaths.length] : undefined;
  const highlighted = new Set(activeGroup?.componentIds);
  const groupEndParts = useMemo(() => new Set(parallel
    .filter(slot => componentBoundary(slot, first))
    .flatMap(slot => [slot.componentIds[0], slot.componentIds.at(-1)])), [first, parallel]);
  const serial = useMemo(() => new Map(slots.flatMap(slot =>
    slot.kind === "series" ? [[slot.wireId, slot] as const] : [])), [slots]);
  const endpoints = useMemo(() => {
    const firstByWire = new Map(topology.wires.map(({ id, from }) => [id, from]));
    const wireByFirst = new Map(diagram.wires.filter(({ points }) => points.length > 1)
      .map(wire => [firstByWire.get(wire.id), wire]));
    return netlist(topology).flatMap(net => {
      const id = net.find(endpoint => diagram.endpoints.has(endpoint));
      if (!id) return [];
      const wire = net.map(endpoint => wireByFirst.get(endpoint)).find(Boolean);
      return [[id, wire ? wireTarget(wire.points) : diagram.endpoints.get(id)!] as const];
    });
  }, [topology, diagram]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function measure() { setViewportWidth(viewport!.clientWidth); }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportRef]);

  useEffect(() => {
    if (armed) modeControls.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [armed]);

  function resetSelection() {
    setFirst("");
    setLast("");
    setAlternate(0);
    setEndpoint("");
    setError(false);
  }

  function arm(part: PaletteItem) {
    setArmed(armed?.[0] === part[0] ? undefined : part);
    setSelected("");
    setConfirm(false);
    resetSelection();
  }

  function insert(slot: TopologySlot, session = new TopologySession(JSON.stringify(document))) {
    if (!armed) return;
    try {
      session.apply({ type: "insert", slot, component: makePart(topology, armed) });
      onChange(session.document);
      paletteControls.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      setArmed(undefined);
      resetSelection();
    } catch {
      setError(true);
    }
  }

  function insertParallel(side: TopologySide) {
    if (!activeGroup) return;
    const other = side === "left" ? activeGroup : slots.find(slot =>
      slot.kind === "parallel" && slot.side === side &&
      slot.componentIds.every((id, index) => id === activeGroup.componentIds[index]) &&
      slot.componentIds.length === activeGroup.componentIds.length);
    if (other) insert(other);
  }

  function selectParallel(id: string) {
    if (!first || last || id === first || !groupEndParts.has(id)) {
      setFirst(id);
      setLast("");
    } else {
      setLast(id);
    }
    setAlternate(0);
  }

  function selectEndpoint(id: string) {
    if (!endpoint || endpoint === id) { setEndpoint(id === endpoint ? "" : id); return; }
    try {
      const session = new TopologySession(JSON.stringify(document));
      insert(session.crossSlot(endpoint, id), session);
    } catch {
      setError(true);
      setEndpoint(id);
    }
  }

  function updateSwitchTime(seconds: number) {
    const updated = { ...document, topology: { ...topology, components: topology.components.map(part =>
      part.id === selected ? { ...part, parameters: { ...part.parameters, atS: seconds } } : part) } };
    onChange(parseTopologyLabDocument(JSON.stringify(updated)));
  }

  const focusPoint = diagram.components.find(({ id }) => id === first);
  const groupControlsY = focusPoint ? Math.max(23 / fieldScale, focusPoint.y - 64) : 30;
  const groupControlsX = (x: number) => Math.min(diagram.width - 23 / fieldScale, Math.max(23 / fieldScale, x));

  return <section className="line-experiment-editor" data-line-experiment-editor aria-label={t.board}>
    <div className="line-experiment-editor-bar">
      <strong>{t.board}</strong>
      <div className="line-experiment-editor-zoom">
        <button type="button" aria-label={t.zoomOut} onClick={zoomOut}>−</button>
        <button type="button" aria-label={t.reset} onClick={resetZoom}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={t.zoomIn} onClick={zoomIn}>+</button>
      </div>
    </div>
    {armed && <div ref={modeControls} className="line-experiment-modes">
      {(Object.keys(t.modes) as SlotMode[]).map(value => <button key={value} type="button"
        data-line-slot-mode={value} aria-pressed={mode === value} onClick={() => { setMode(value); resetSelection(); }}>{t.modes[value]}</button>)}
    </div>}
    <div className="line-experiment-viewport" ref={viewportRef} data-line-experiment-viewport
      role="group" aria-label={t.board} tabIndex={0} {...viewportEvents}>
      <div className="line-experiment-field" style={{ width: diagram.width * fieldScale, height: diagram.height * fieldScale }}>
        <svg viewBox={`0 0 ${diagram.width} ${diagram.height}`} className="line-experiment-schematic" aria-hidden="true">
          {diagram.wires.map(({ id, points }) => <polyline key={id} data-line-wire={id}
            points={points.map(point => `${point.x},${point.y}`).join(" ")} />)}
          {diagram.junctions.map(({ id, x, y }) => <circle key={id} cx={x} cy={y} r={3} className="line-experiment-dot" />)}
          {diagram.components.map(({ id, x, y }) => {
            const part = devices.get(id)!;
            const rotation = diagram.rotations.get(id) ?? 0;
            const vertical = Math.abs(rotation) === 90;
            return <g key={id} transform={`translate(${x} ${y})`} data-line-glyph={id}
              data-line-kind={part.kind} data-line-rotation={rotation} data-line-highlighted={highlighted.has(id) || undefined}>
              {highlighted.has(id) && <rect className="line-experiment-part-highlight"
                x={vertical ? -29 : -47} y={vertical ? -44 : -25} width={vertical ? 58 : 94} height={vertical ? 88 : 50} rx={8} />}
              <g transform={`rotate(${part.kind === "line" && diagram.returnY !== undefined ? 0 : rotation})`}><LineGlyph part={part} paired={diagram.returnY !== undefined} /></g>
              <text x={vertical ? 31 : 0} y={vertical ? 5 : -21} textAnchor={vertical ? "start" : "middle"}>{id}</text>
            </g>;
          })}
        </svg>
        {!armed && <>
          {diagram.components.map(({ id, x, y }) => {
            const isSection = devices.get(id)?.kind === "line";
            return <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-component={id}
              data-line-section={isSection ? id : undefined} className="line-experiment-object"
              aria-label={`${isSection ? t.open : t.select} ${id}`} title={`${isSection ? t.open : t.select} ${id}`}
              aria-pressed={isSection ? undefined : selected === id} onClick={() => {
                if (isSection) onOpenSection(id);
                else { setSelected(id); setConfirm(false); }
              }} />;
          })}
          {diagram.components.filter(({ id }) => devices.get(id)?.kind === "line").map(({ id, x, y }) =>
            <CanvasButton key={id} point={{ x, y: y + 46 }} fieldScale={fieldScale} data-line-inspect-section={id}
              className="line-experiment-minor" aria-label={`${t.select} ${id}`} onClick={() => {
                setSelected(id); setConfirm(false);
              }}>⋯</CanvasButton>)}
          <CanvasButton point={diagram.append} fieldScale={fieldScale} data-line-append
            aria-label={t.append} title={t.append} onClick={onAppendSection}>+ TL</CanvasButton>
        </>}
        {armed && mode === "series" && diagram.wires.filter(({ id, points }) => serial.has(id) && points.length).map(({ id, points }) => {
          const slot = serial.get(id)!;
          return <CanvasButton key={id} point={wireTarget(points)} fieldScale={fieldScale}
            data-line-series-slot={id} aria-label={`${t.add} ${armed[2]} · ${slot.boundaries.join(" / ")}`}
            onClick={() => insert(slot)}>+</CanvasButton>;
        })}
        {armed && mode === "parallel" && diagram.components.filter(({ id }) =>
          parallel.some(slot => componentBoundary(slot, id))).map(({ id, x, y }) =>
          <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-parallel-part={id}
            className="line-experiment-object" aria-label={`${t.select} ${id}`}
            aria-pressed={id === first || id === last} onClick={() => selectParallel(id)} />)}
        {armed && mode === "parallel" && focusPoint && activeGroup && <>
          <CanvasButton point={{ x: groupControlsX(focusPoint.x - 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="left" aria-label={t.left} title={t.left} onClick={() => insertParallel("left")}>←+</CanvasButton>
          <CanvasButton point={{ x: groupControlsX(focusPoint.x + 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="right" aria-label={t.right} title={t.right} onClick={() => insertParallel("right")}>+→</CanvasButton>
          {groupPaths.length > 1 && <CanvasButton point={{ x: focusPoint.x, y: focusPoint.y + 57 / fieldScale }}
            fieldScale={fieldScale} data-line-parallel-alternate className="line-experiment-minor"
            aria-label={t.alternate} onClick={() => setAlternate(value => value + 1)}>↻</CanvasButton>}
        </>}
        {armed && mode === "cross" && endpoints.map(([id, point]) =>
          <CanvasButton key={id} point={point} fieldScale={fieldScale} data-line-cross-endpoint={id}
            aria-label={`${t.select} ${id}`} aria-pressed={endpoint === id} onClick={() => selectEndpoint(id)}>·</CanvasButton>)}
      </div>
    </div>
    {armed && <p className="line-experiment-editor-note" role="status">{hasError ? t.invalid
      : mode === "series" && !serial.size || mode === "parallel" && !parallel.length ? t.empty : t.search[mode]}</p>}
    {selectedPart && !armed && <div className="line-experiment-selection">
      <strong>{selectedPart.id}</strong>
      {selectedPart.kind === "switch" && <SwitchTime key={`${selectedPart.id}:${selectedPart.parameters.atS}`}
        part={selectedPart} label={selectedPart.parameters.closes === true ? t.closeTime : t.time} onSave={updateSwitchTime} />}
      {confirm ? <>
        <button type="button" data-line-confirm-remove onClick={() => {
          onRemove(selected);
          setSelected("");
          setConfirm(false);
        }}>{t.confirm} {selected}</button>
        <button type="button" onClick={() => setConfirm(false)}>{t.cancel}</button>
      </> : <button type="button" data-line-remove aria-label={`${t.remove} ${selected}`}
        onClick={() => setConfirm(true)}>{t.remove}</button>}
    </div>}
    <div ref={paletteControls} className="line-experiment-palette" role="group" aria-label={t.palette}>
      {palette.map((item, index) => <button key={item[0]} type="button" data-line-palette={item[0]}
        title={t.names[index]} aria-label={t.names[index]} aria-pressed={armed?.[0] === item[0]} onClick={() => arm(item)}>
        {item[1] === "switch" ? <svg viewBox="0 0 30 20" aria-hidden="true">
          <path d={item[0] === "switch-open" ? "M0 12H8L21 5M22 12H30" : "M0 12H30"} />
          <circle cx="8" cy="12" r="1.5" /><circle cx="22" cy="12" r="1.5" />
        </svg> : item[2]}
      </button>)}
    </div>
  </section>;
}
