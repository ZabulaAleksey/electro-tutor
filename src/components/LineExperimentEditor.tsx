import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Language } from "../types";
import { netlist, type CircuitComponent } from "../circuit/topology";
import { simplifyTopologyForView } from "../circuit/topology-equivalence";
import { parts, type PartKind } from "../circuit/drawing";
import type { Point } from "../circuit/topology-layout";
import { listTopologySlots, type TopologySide, type TopologySlot } from "../circuit/topology-slots";
import { parseTopologyLabDocument, TopologySession, type TopologyLabDocument } from "../circuit/topology-session";
import { useTopologyViewport } from "../circuit/use-topology-viewport";
import { formatEngineeringValue } from "../engineering/format";
import { CapacitorGlyph, InductorGlyph, ResistorGlyph, TextbookSourceGlyph } from "../engineering/symbols";
import { layoutLineExperiment, placeLcCanvasTargets, wireTarget } from "./line-experiment-layout";
import "./LineExperimentEditor.css";

type Props = {
  language: Language;
  document: TopologyLabDocument;
  onChange: (next: TopologyLabDocument) => void;
  onAppendSection?: (endpoint?: string) => void;
  onRemove: (id: string) => void;
  onOpenSection?: (id: string) => void;
  variant?: "transient" | "steady" | "lc" | "variable";
  seriesWireIds?: readonly string[];
  canRemove?: (id: string) => boolean;
  referenceEndpoint?: string;
  renderInspector?: (part: CircuitComponent) => ReactNode;
};

const palette = [
  ["r", "r", "R"], ["l", "l", "L"], ["c", "c", "C"], ["voltage", "voltage", "E"],
  ["current", "current", "J"], ["switch-open", "switch", "K"], ["switch-closed", "switch", "K"],
] as const satisfies readonly (readonly [string, PartKind, string])[];
type PaletteItem = typeof palette[number];
type ParallelSlot = Extract<TopologySlot, { kind: "parallel" }>;

const copy = {
  ru: {
    board: "Схема опыта", palette: "Элементы схемы", append: "Добавить линию справа",
    names: ["Резистор", "Катушка", "Конденсатор", "Источник ЭДС", "Источник тока", "Замыкающий ключ", "Размыкающий ключ"],
    search: { series: "Выберите участок провода.", parallel: "Выберите элемент или два крайних элемента группы.", cross: "Выберите два вывода или узла." },
    add: "Вставить", open: "Открыть опыт для", select: "Выбрать", reference: "Полюс отсчёта общего обратного провода",
    left: "Вставить ветвь с левой стороны", right: "Вставить ветвь с правой стороны",
    alternate: "Следующий путь между элементами", time: "Время коммутации, с", closeTime: "Время замыкания, с",
    remove: "Удалить элемент", confirm: "Удалить", cancel: "Отмена", invalid: "Здесь вставка недоступна.",
    empty: "На схеме нет подходящего участка.", zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Вернуть масштаб 100%",
    port: "Измерительный порт",
  },
  uk: {
    board: "Схема досліду", palette: "Елементи схеми", append: "Додати лінію справа",
    names: ["Резистор", "Котушка", "Конденсатор", "Джерело ЕРС", "Джерело струму", "Замикаючий ключ", "Розмикаючий ключ"],
    search: { series: "Виберіть ділянку проводу.", parallel: "Виберіть елемент або два крайні елементи групи.", cross: "Виберіть два виводи або вузли." },
    add: "Вставити", open: "Відкрити дослід для", select: "Вибрати", reference: "Полюс відліку спільного зворотного проводу",
    left: "Вставити гілку з лівого боку", right: "Вставити гілку з правого боку",
    alternate: "Наступний шлях між елементами", time: "Час комутації, с", closeTime: "Час замикання, с",
    remove: "Видалити елемент", confirm: "Видалити", cancel: "Скасувати", invalid: "Тут вставка недоступна.",
    empty: "На схемі немає придатної ділянки.", zoomIn: "Збільшити", zoomOut: "Зменшити", reset: "Повернути масштаб 100%",
    port: "Вимірювальний порт",
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

export default function LineExperimentEditor({ language, document, onChange, onAppendSection, onRemove, onOpenSection,
  variant = "transient", referenceEndpoint, renderInspector, seriesWireIds, canRemove }: Props) {
  const t = copy[language];
  const lc = variant === "lc";
  const steady = variant === "steady";
  const variable = variant === "variable";
  const selectSection = steady || variable;
  const referenceDescription = useId();
  const [armed, setArmed] = useState<PaletteItem>();
  const [selected, setSelected] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [alternate, setAlternate] = useState(0);
  const [endpoint, setEndpoint] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [hasError, setError] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const paletteControls = useRef<HTMLDivElement>(null);
  const { viewportRef, zoom, zoomIn, zoomOut, resetZoom, viewportEvents } = useTopologyViewport();

  const [expandedDocument, setExpandedDocument] = useState<TopologyLabDocument>();
  const { topology } = document;
  const sourceIds = useMemo(() => new Set(topology.components.map(part => part.id)), [topology]);
  const displayDocument = useMemo(() => {
    if (armed || selected || expandedDocument === document || variable) return document;
    const observed = referenceEndpoint ? [...document.observedEndpoints, referenceEndpoint] : document.observedEndpoints;
    const topology = simplifyTopologyForView(document.topology, observed);
    return topology === document.topology ? document : { ...document, topology };
  }, [document, armed, selected, expandedDocument, variable, referenceEndpoint]);
  const diagram = useMemo(() => layoutLineExperiment(displayDocument), [displayDocument]);
  const reference = steady && referenceEndpoint ? diagram.endpoints.get(referenceEndpoint) : undefined;
  const referenceY = reference && diagram.returnY !== undefined && reference.y > diagram.returnY - 30
    ? diagram.returnY : reference?.y;
  const devices = useMemo(() => new Map(displayDocument.topology.components.map(part => [part.id, part])), [displayDocument]);
  function displayName(id: string) {
    const part = devices.get(id);
    if (!part || sourceIds.has(id)) return id;
    const [key, unit] = part.kind === "r" ? ["ohm", "Ω"] : part.kind === "l" ? ["henry", "H"] : ["farad", "F"];
    return part.kind.toUpperCase() + (language === "ru" ? "экв" : "екв") + " = "
      + formatEngineeringValue(Number(part.parameters[key]), unit, language);
  }
  const port = lc ? displayDocument.topology.components.find(part => part.kind === "port") : undefined;
  const appendPart = steady && topology.components.find(part => part.terminals.includes(diagram.appendEndpoint ?? ""));
  const appendPoint = steady && diagram.returnY === undefined && diagram.appendEndpoint
    ? diagram.endpoints.get(diagram.appendEndpoint) : undefined;
  const appendLabel = appendPart ? `${t.append} · ${appendPart.id}` : t.append;
  const slots = useMemo(() => listTopologySlots(topology, document.observedEndpoints), [topology, document.observedEndpoints]);
  const parallel = useMemo(() => slots.filter((slot): slot is ParallelSlot =>
    slot.kind === "parallel" && slot.side === "left" && (!port || !slot.componentIds.includes(port.id))), [port, slots]);
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
    return netlist(topology).flatMap(net => {
      const portTerminal = port?.terminals.find(id => net.includes(id));
      const portPoint = portTerminal ? diagram.endpoints.get(portTerminal) : undefined;
      if (portTerminal && portPoint) return [[portTerminal, portPoint] as const];
      const id = net.find(endpoint => diagram.endpoints.has(endpoint));
      if (!id) return [];
      return [[id, diagram.endpoints.get(id)!] as const];
    });
  }, [port, topology, diagram]);

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
    if (!armed) return;
    const target = viewportRef.current?.querySelector<HTMLElement>("[data-line-series-slot]");
    target?.focus({ preventScroll: true });
  }, [armed, variable, viewportRef]);

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
      const component = makePart(topology, armed);
      session.apply({ type: "insert", slot, component: variable
        ? { ...component, parameters: { ...component.parameters, ohm: 25, nextOhm: 25 } } : component });
      // Keep the editable/archive document as the source of truth. The
      // renderer may derive a reduced visual projection, but insertion,
      // export, import and undo always retain the original components.
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
  const paletteStart = lc ? 1 : 0;
  const paletteEnd = lc ? 3 : variable ? 1 : steady ? 5 : palette.length;
  const seriesTargets = armed && !first && !endpoint ? diagram.wires.filter(({ id, points }) =>
    serial.has(id) && points.length && (!seriesWireIds || seriesWireIds.includes(id))) : [];
  const crossTargets = armed && !variable && !first ? endpoints : [];
  const partTargets = armed && !variable && !endpoint ? diagram.components.filter(({ id }) =>
    parallel.some(slot => componentBoundary(slot, id))) : [];
  const targets = [...seriesTargets, ...crossTargets.map(([id, point]) => ({ id, points: [point] }))];
  const placement = placeLcCanvasTargets(targets, diagram.width, diagram.height, fieldScale, partTargets);
  const markerPoints = new Map(placement.markers.map(({ id, point }) => [id, point]));

  return <section className="line-experiment-editor" data-line-experiment-editor data-line-editor-variant={variant} aria-label={t.board}
    onKeyDown={event => {
      if (armed && event.key === "Escape") {
        event.preventDefault();
        paletteControls.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
        arm(armed);
      }
    }}>
    <div className="line-experiment-editor-bar">
      <strong>{t.board}</strong>
      {expandedDocument === document && <button type="button" onClick={() => {
        setExpandedDocument(undefined); setSelected(""); setArmed(undefined);
      }}>{language === "ru" ? "Свернуть схему" : "Згорнути схему"}</button>}
      <div className="line-experiment-editor-zoom">
        <button type="button" aria-label={t.zoomOut} onClick={zoomOut}>−</button>
        <button type="button" aria-label={t.reset} onClick={resetZoom}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label={t.zoomIn} onClick={zoomIn}>+</button>
      </div>
    </div>
    {(reference || port) && <span id={referenceDescription} hidden>{port
      ? `${t.port} ${port.id} · ${port.terminals.join(" / ")}`
      : `${t.reference}: ${referenceEndpoint}`}</span>}
    <div className="line-experiment-viewport" ref={viewportRef} data-line-experiment-viewport
      role="group" aria-label={t.board} aria-describedby={reference || port ? referenceDescription : undefined} tabIndex={0} {...viewportEvents}>
      <div className="line-experiment-field" style={{ width: diagram.width * fieldScale, height: placement.height * fieldScale }}>
        <svg viewBox={`0 0 ${diagram.width} ${placement.height}`} className="line-experiment-schematic" aria-hidden="true">
          {diagram.wires.map(({ id, points }) => <polyline key={id} data-line-wire={id}
            points={points.map(point => `${point.x},${point.y}`).join(" ")} />)}
          {diagram.junctions.map(({ id, x, y }) => <circle key={id} cx={x} cy={y} r={3} className="line-experiment-dot" />)}
          {reference && <path data-line-reference={referenceEndpoint} className="line-experiment-reference"
            transform={`translate(${reference.x} ${referenceY})`} d="M0 0V9M-10 9H10M-6 13H6M-3 17H3" />}
          {diagram.components.map(({ id, x, y }) => {
            const part = devices.get(id)!;
            if (lc && part.kind === "port") return <g key={id} data-line-glyph={id} data-line-kind="port">
              {part.terminals.map((terminal, index) => {
                const lead = diagram.endpoints.get(terminal)!;
                return <g key={terminal}>
                  <circle className="line-experiment-port" data-lc-port-terminal={terminal} cx={lead.x} cy={lead.y} r={6} />
                  <text x={lead.x} y={lead.y - 12} textAnchor="middle">{index === 0 ? "a" : "b"}</text>
                </g>;
              })}
            </g>;
            const rotation = diagram.rotations.get(id) ?? 0;
            const vertical = Math.abs(rotation) === 90;
            return <g key={id} transform={`translate(${x} ${y})`} data-line-glyph={id}
              data-line-kind={part.kind} data-line-rotation={rotation} data-line-highlighted={highlighted.has(id) || undefined}>
              {highlighted.has(id) && <rect className="line-experiment-part-highlight"
                x={vertical ? -29 : -47} y={vertical ? -44 : -25} width={vertical ? 58 : 94} height={vertical ? 88 : 50} rx={8} />}
              <g transform={`rotate(${part.kind === "line" && diagram.returnY !== undefined ? 0 : rotation})`}>
                <LineGlyph part={part} paired={diagram.returnY !== undefined} />
              </g>
              <text x={vertical ? 31 : 0} y={vertical ? 5 : -21} textAnchor={vertical ? "start" : "middle"}>{displayName(id)}</text>
            </g>;
          })}
          {placement.markers.map(({ id, point, anchor }) => anchor && <g key={id} data-lc-target-leader={id}
            className="line-experiment-lc-leader">
            <line x1={anchor.x} y1={anchor.y} x2={point.x} y2={point.y} />
            <circle cx={anchor.x} cy={anchor.y} r={3} />
          </g>)}
        </svg>
        {!armed && <>
          {diagram.components.map(({ id, x, y }) => {
            if (id === port?.id) return null;
            const isSection = devices.get(id)?.kind === "line";
            const action = isSection && !selectSection ? t.open : t.select;
            return <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-component={id}
              data-line-section={isSection ? id : undefined} className="line-experiment-object"
              aria-label={`${action} ${displayName(id)}`} title={`${action} ${displayName(id)}`}
              aria-pressed={isSection && !selectSection ? undefined : selected === id} onClick={() => {
                if (!sourceIds.has(id)) { setExpandedDocument(document); return; }
                if (isSection) onOpenSection?.(id);
                if (!isSection || selectSection) { setSelected(id); setConfirm(false); }
              }} />;
          })}
          {!selectSection && !lc && diagram.components.filter(({ id }) => devices.get(id)?.kind === "line").map(({ id, x, y }) =>
            <CanvasButton key={id} point={{ x, y: y + 46 }} fieldScale={fieldScale} data-line-inspect-section={id}
              className="line-experiment-minor" aria-label={`${t.select} ${id}`} onClick={() => {
                setSelected(id); setConfirm(false);
              }}>⋯</CanvasButton>)}
          {onAppendSection && !lc && (!steady || diagram.appendEndpoint) &&
            <CanvasButton point={appendPoint ? { x: Math.min(diagram.width - 26, appendPoint.x), y: Math.max(28, appendPoint.y - 64) } : diagram.append}
              fieldScale={fieldScale} data-line-append
              data-line-append-endpoint={steady ? diagram.appendEndpoint : undefined}
              aria-label={appendLabel} title={appendLabel}
              onClick={() => onAppendSection(steady ? diagram.appendEndpoint : undefined)}>+ TL</CanvasButton>}
        </>}
        {armed && seriesTargets.map(({ id, points }) => {
          const slot = serial.get(id)!;
          return <CanvasButton key={id} point={markerPoints.get(id) ?? wireTarget(points)} fieldScale={fieldScale}
            data-line-series-slot={id} aria-label={`${t.add} ${armed[2]} · ${slot.boundaries.join(" / ")}`}
            data-lc-canvas-marker={lc || undefined} data-line-spaced-marker={variable || undefined}
            onClick={() => insert(slot)}>+</CanvasButton>;
        })}
        {partTargets.map(({ id, x, y }) =>
          <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-parallel-part={id}
            className="line-experiment-object" aria-label={`${t.select} ${id}`}
            aria-pressed={id === first || id === last} onClick={() => selectParallel(id)} />)}
        {armed && focusPoint && activeGroup && <>
          <CanvasButton point={{ x: groupControlsX(focusPoint.x - 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="left" aria-label={t.left} title={t.left} onClick={() => insertParallel("left")}>←+</CanvasButton>
          <CanvasButton point={{ x: groupControlsX(focusPoint.x + 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="right" aria-label={t.right} title={t.right} onClick={() => insertParallel("right")}>+→</CanvasButton>
          {groupPaths.length > 1 && <CanvasButton point={{ x: focusPoint.x, y: focusPoint.y + 57 / fieldScale }}
            fieldScale={fieldScale} data-line-parallel-alternate className="line-experiment-minor"
            aria-label={t.alternate} onClick={() => setAlternate(value => value + 1)}>↻</CanvasButton>}
        </>}
        {crossTargets.map(([id, point]) =>
          <CanvasButton key={id} point={markerPoints.get(id) ?? point} fieldScale={fieldScale} data-line-cross-endpoint={id}
            data-lc-canvas-marker={lc || undefined}
            aria-label={`${t.select} ${id}`} aria-pressed={endpoint === id} onClick={() => selectEndpoint(id)}>·</CanvasButton>)}
      </div>
    </div>
    {armed && <p className="line-experiment-editor-note" role="status">{hasError ? t.invalid
      : variable ? (seriesTargets.length ? t.search.series : t.empty) : endpoint ? t.search.cross : first ? t.search.parallel : t.search.series + " " + t.search.cross}</p>}
    {selectedPart && !armed && <div className="line-experiment-selection" data-line-selected-part={selectedPart.id}>
      {(!selectSection && !lc || !renderInspector) && <strong>{selectedPart.id}</strong>}
      {!steady && selectedPart.kind === "switch" && <SwitchTime key={`${selectedPart.id}:${selectedPart.parameters.atS}`}
        part={selectedPart} label={selectedPart.parameters.closes === true ? t.closeTime : t.time} onSave={updateSwitchTime} />}
      {renderInspector?.(selectedPart)}
      {(!canRemove || canRemove(selected)) && (confirm ? <>
        <button type="button" data-line-confirm-remove onClick={() => {
          onRemove(selected);
          setSelected("");
          setConfirm(false);
        }}>{t.confirm} {selected}</button>
        <button type="button" onClick={() => setConfirm(false)}>{t.cancel}</button>
      </> : <button type="button" data-line-remove aria-label={`${t.remove} ${selected}`}
        onClick={() => setConfirm(true)}>{t.remove}</button>)}
    </div>}
    <div ref={paletteControls} className="line-experiment-palette" role="group" aria-label={t.palette}>
      {palette.slice(paletteStart, paletteEnd).map((item, index) => <button key={item[0]} type="button" data-line-palette={item[0]}
        title={t.names[index + paletteStart]} aria-label={t.names[index + paletteStart]} aria-pressed={armed?.[0] === item[0]}
        onClick={() => arm(item)}>
        {item[1] === "switch" ? <svg viewBox="0 0 30 20" aria-hidden="true">
          <path d={item[0] === "switch-open" ? "M0 12H8L21 5M22 12H30" : "M0 12H30"} />
          <circle cx="8" cy="12" r="1.5" /><circle cx="22" cy="12" r="1.5" />
        </svg> : item[2]}
      </button>)}
    </div>
  </section>;
}
