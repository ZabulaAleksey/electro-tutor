import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { geometryAfterInsertion } from "./line-slot-geometry";
import { directTargets, distinctLcParallelSlots, type DirectTarget } from "./line-slot-targets";
import type { Language } from "../types";
import { netlist, type CircuitComponent } from "../circuit/topology";
import { parallelBranchForComponent } from "../circuit/topology-branch-removal";
import { bypassSeriesDevice, matchingOpenWire, planSeriesBypass } from "../circuit/topology-operations";
import { lineJunctionPlacements } from "./line-junction-placement";
import { simplifyTopologyForView } from "../circuit/topology-equivalence";
import { parts, validPartParameter, type PartKind } from "../circuit/drawing";
import type { Point } from "../circuit/topology-layout";
import { listTopologySlots, type TopologySide, type TopologySlot } from "../circuit/topology-slots";
import { parseTopologyLabDocument, TopologySession, type TopologyCommand, type TopologyLabDocument } from "../circuit/topology-session";
import { useTopologyViewport } from "../circuit/use-topology-viewport";
import { formatEngineeringValue } from "../engineering/format";
import { CapacitorGlyph, InductorGlyph, ResistorGlyph, TextbookSourceGlyph } from "../engineering/symbols";
import { captureLineGeometry, layoutLineExperiment, placeLcCanvasTargets, wireTarget } from "./line-experiment-layout";
import "./LineExperimentEditor.css";

type Props = {
  language: Language;
  document: TopologyLabDocument;
  onChange: (next: TopologyLabDocument) => void;
  onAppendSection?: (endpoint?: string) => void;
  onRemove?: (id: string, source: TopologyLabDocument) => void;
  onOpenSection?: (id: string) => void;
  onRestoreStarter?: () => void;
  variant?: "transient" | "steady" | "lc" | "variable";
  seriesWireIds?: readonly string[];
  canRemove?: (id: string) => boolean;
  referenceEndpoint?: string;
  validateParameters?: (next: TopologyLabDocument) => void;
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
    parallel: "Подключить параллельно", wholeParallel: "Подключить параллельно всему двухполюснику (a–b)",
    alternate: "Следующий путь между элементами", time: "Время коммутации, с", closeTime: "Время замыкания, с",
    remove: "Удалить элемент", confirm: "Удалить", cancel: "Отмена", invalid: "Здесь вставка недоступна.",
    empty: "На схеме нет подходящего участка.", zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Вернуть масштаб 100%",
    port: "Измерительный порт", inputPair: "Входная пара", outputPair: "Выходная пара",
    wires: "Провода", clear: "Очистить схему", confirmClear: "Очистку можно отменить.",
    breakWire: "Разорвать соединение", restoreWire: "Восстановить соединение",
    insertIntoWire: "Вставить элемент", choosePart: "Выберите элемент в палитре.",
    bypass: "Заменить проводником", removeBranch: "Удалить ветвь",
    starter: "Начальная схема", emptyBoard: "Схема пуста.", operationError: "Для выбранного участка эта операция недоступна.",
  },
  uk: {
    board: "Схема досліду", palette: "Елементи схеми", append: "Додати лінію справа",
    names: ["Резистор", "Котушка", "Конденсатор", "Джерело ЕРС", "Джерело струму", "Замикаючий ключ", "Розмикаючий ключ"],
    search: { series: "Виберіть ділянку проводу.", parallel: "Виберіть елемент або два крайні елементи групи.", cross: "Виберіть два виводи або вузли." },
    add: "Вставити", open: "Відкрити дослід для", select: "Вибрати", reference: "Полюс відліку спільного зворотного проводу",
    left: "Вставити гілку з лівого боку", right: "Вставити гілку з правого боку",
    parallel: "Підключити паралельно", wholeParallel: "Підключити паралельно всьому двополюснику (a–b)",
    alternate: "Наступний шлях між елементами", time: "Час комутації, с", closeTime: "Час замикання, с",
    remove: "Видалити елемент", confirm: "Видалити", cancel: "Скасувати", invalid: "Тут вставка недоступна.",
    empty: "На схемі немає придатної ділянки.", zoomIn: "Збільшити", zoomOut: "Зменшити", reset: "Повернути масштаб 100%",
    port: "Вимірювальний порт", inputPair: "Вхідна пара", outputPair: "Вихідна пара",
    wires: "Проводи", clear: "Очистити схему", confirmClear: "Очищення можна скасувати.",
    breakWire: "Розірвати з’єднання", restoreWire: "Відновити з’єднання",
    insertIntoWire: "Вставити елемент", choosePart: "Виберіть елемент у палітрі.",
    bypass: "Замінити провідником", removeBranch: "Видалити гілку",
    starter: "Початкова схема", emptyBoard: "Схема порожня.", operationError: "Для вибраної ділянки ця операція недоступна.",
  },
} as const;

function makePart(topology: TopologyLabDocument["topology"], [choice, kind, prefix]: PaletteItem, reservedIds: readonly string[]): CircuitComponent {
  const graphIds = new Set([...reservedIds, ...topology.junctions, ...topology.wires.map(({ id }) => id),
    ...topology.components.flatMap(({ id, terminals }) => [id, ...terminals])]);
  let index = 1;
  while ([prefix + index, prefix + index + ":a", prefix + index + ":b"].some(id => graphIds.has(id))) index++;
  const id = prefix + index;
  const parameters = kind === "switch" ? { ...parts.switch.parameters, closed: choice === "switch-closed", closes: choice === "switch-open" }
    : { ...parts[kind].parameters };
  return { id, kind, parameters, terminals: [id + ":a", id + ":b"] };
}

function LineGlyph({ part, railOffset }: { part: CircuitComponent; railOffset?: number }) {
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
      <path className="line-experiment-conductor" d={railOffset !== undefined ? `M-48 0H48M-48 ${railOffset}H48` : "M-42 -8H42M-42 8H42"} />
      {railOffset !== undefined && <path className="line-experiment-electric-field" d={`M-48 6V${railOffset - 6}M48 6V${railOffset - 6}`} />}
    </>;
    default: return <path d="M-52 0H-18M18 0H52M-18 -13H18V13H-18Z" />;
  }
}

function PhysicalLineGlyph({ terminals, pins, inputLabel, outputLabel }: {
  terminals: readonly string[]; pins: readonly Point[]; inputLabel: string; outputLabel: string;
}) {
  const [a, b, returnIn, returnOut] = pins;
  const labels = ["1+", "2+", "1−", "2−"];
  const across = { x: Math.sign(returnIn.x - a.x), y: Math.sign(returnIn.y - a.y) };
  const coordinates = (point: Point, offset = 0) => `${point.x + across.x * offset} ${point.y + across.y * offset}`;
  return <>
    <path className="line-experiment-conductor" d={`M${coordinates(a)}L${coordinates(b)}M${coordinates(returnIn)}L${coordinates(returnOut)}`} />
    <path className="line-experiment-electric-field" d={`M${coordinates(a, 6)}L${coordinates(returnIn, -6)}M${coordinates(b, 6)}L${coordinates(returnOut, -6)}`} />
    {pins.map(({ x, y }, index) => {
      const distance = index < 2 ? -12 : 12;
      const labelX = x + across.x * distance;
      const labelY = y + across.y * distance + 3;
      return <g key={terminals[index]} className="line-experiment-physical-port">
        <circle data-line-physical-terminal={terminals[index]} className="line-experiment-port" cx={x} cy={y} r={3.5}>
          <title>{`${index % 2 === 0 ? inputLabel : outputLabel} · ${labels[index]}`}</title>
        </circle>
        <text x={labelX} y={labelY} textAnchor="middle">{labels[index]}</text>
      </g>;
    })}
  </>;
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

const parameterFields = {
  r: [["ohm", "R, Ω", 1]], l: [["henry", "L, mH", 1e3]], c: [["farad", "C, µF", 1e6]],
  voltage: [["voltageV", "E, V", 1], ["resistanceOhm", "R, Ω", 1]],
  current: [["currentA", "J, A", 1]], line: [["lengthM", "ℓ, km", .001], ["impedanceOhm", "Z₀, Ω", 1],
    ["velocityMS", "v, m/s", 1], ["resistanceOhmM", "R′, Ω/m", 1]],
} as const;

function TransientParameters({ part, onSave, language }: { part: CircuitComponent; onSave: (key: string, value: number) => void; language: Language }) {
  const [invalid, setInvalid] = useState("");
  const fields = parameterFields[part.kind as keyof typeof parameterFields] ?? [];
  return <>{fields.map(([key, label, scale]) => <label key={part.id + key}>{label}
    <input data-line-parameter={key} key={String(part.parameters[key])} type="number" step="any"
      defaultValue={Number(part.parameters[key] ?? 0) * scale} onBlur={event => {
        const value = event.currentTarget.valueAsNumber / scale;
        if (!validPartParameter(key, value)) {
          setInvalid(key); event.currentTarget.value = String(Number(part.parameters[key] ?? 0) * scale); return;
        }
        setInvalid("");
        if (value !== part.parameters[key]) {
          try { onSave(key, value); }
          catch { setInvalid(key); event.currentTarget.value = String(Number(part.parameters[key] ?? 0) * scale); }
        }
      }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>)}{invalid && <small role="alert">{language === "ru" ? "Проверьте значение" : "Перевірте значення"}</small>}</>;
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

export default function LineExperimentEditor({ language, document, onChange, onAppendSection, onRemove, onOpenSection, onRestoreStarter,
  variant = "transient", referenceEndpoint, renderInspector, validateParameters, seriesWireIds, canRemove }: Props) {
  const t = copy[language];
  const lc = variant === "lc";
  const steady = variant === "steady";
  const variable = variant === "variable";
  const selectSection = steady || variable;
  const referenceDescription = useId();
  const [armed, setArmed] = useState<PaletteItem>();
  const [selected, setSelected] = useState("");
  const [wireMode, setWireMode] = useState(false);
  const [selectedWire, setSelectedWire] = useState("");
  const [insertIntoWire, setInsertIntoWire] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [alternate, setAlternate] = useState(0);
  const [endpoint, setEndpoint] = useState("");
  const [pairMode, setPairMode] = useState(false);
  const [preview, setPreview] = useState<TopologySlot>();
  const [menuPoint, setMenuPoint] = useState<Point>({ x: 10, y: 10 });
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [hasError, setError] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const dragTouch = useRef<{ id: number; start: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const field = useRef<HTMLDivElement>(null);
  const wireModeButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const wireMenu = useRef<HTMLDivElement>(null);
  const clearMenu = useRef<HTMLDivElement>(null);
  const paletteControls = useRef<HTMLDivElement>(null);
  const { viewportRef, zoom, zoomIn, zoomOut, resetZoom, viewportEvents } = useTopologyViewport();

  const [expandedDocument, setExpandedDocument] = useState<TopologyLabDocument>();
  const { topology } = document;
  const physicalLine = variant === "transient"
    && topology.components.some(part => part.kind === "line" && part.terminals.length === 4);
  const emptyBoard = !topology.wires.length && !topology.junctions.length && !document.brokenWires?.length
    && topology.components.every(part => part.kind === "port");
  const sourceIds = useMemo(() => new Set(topology.components.map(part => part.id)), [topology]);
  const displayDocument = useMemo(() => {
    // Reduced components have synthetic pins and wires. The physical editor
    // uses its editable graph to keep both rails and their geometry addressable.
    if (physicalLine || armed || wireMode || selected || document.brokenWires?.length || expandedDocument === document || variable) return document;
    const observed = referenceEndpoint ? [...document.observedEndpoints, referenceEndpoint] : document.observedEndpoints;
    // Synthetic parallel folds do not have positions on the saved editable canvas.
    const topology = simplifyTopologyForView(document.topology, observed, { preserveParallelGeometry: lc && !!document.geometry });
    return topology === document.topology ? document : { ...document, topology };
  }, [document, physicalLine, armed, wireMode, selected, expandedDocument, variable, referenceEndpoint, lc]);
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
  const appendLabel = appendPart ? `${t.append} · ${appendPart.id}` : t.append;
  const slots = useMemo(() => listTopologySlots(topology, document.observedEndpoints), [topology, document.observedEndpoints]);
  const parallel = useMemo(() => slots.filter((slot): slot is ParallelSlot =>
    slot.kind === "parallel" && slot.side === "left" && (!port || !slot.componentIds.includes(port.id))), [port, slots]);
  const nets = useMemo(() => netlist(topology), [topology]);
  const membership = useMemo(() => new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const))), [nets]);
  const selectedPart = devices.get(selected);
  const legacyTransient = variant === "transient" && !physicalLine;
  const sourceReturn = legacyTransient
    ? topology.components.find(part => part.kind === "voltage" || part.kind === "current")?.terminals[1] : undefined;
  const automaticBypass = useMemo(() => {
    if (variable || !selected) return false;
    const reference = referenceEndpoint ?? sourceReturn;
    const protectedEnds = reference ? [...document.observedEndpoints, reference] : document.observedEndpoints;
    try {
      const planned = planSeriesBypass(topology, selected, protectedEnds);
      return !matchingOpenWire(document.brokenWires ?? [], planned.wire);
    } catch { return false; }
  }, [document, referenceEndpoint, selected, sourceReturn, topology, variable]);
  const explicitBypass = useMemo(() => {
    if (variable || !selected) return false;
    try { bypassSeriesDevice(topology, selected, [], lc); return true; } catch { return false; }
  }, [lc, selected, topology, variable]);
  const removableBranch = useMemo(() => !variable && selected
    ? parallelBranchForComponent(topology, selected, document.observedEndpoints) : undefined,
  [topology, selected, variable, document.observedEndpoints]);
  const dots = useMemo(() => lineJunctionPlacements(displayDocument.topology, diagram), [diagram, displayDocument]);
  const fit = viewportWidth ? Math.min(1, Math.max(.65, viewportWidth / diagram.width)) : 1;
  const fieldScale = fit * zoom;
  // Choose group boundaries on the actual circuit. A closed loop can expose
  // two paths with the same end components, so both remain selectable.
  const groupPaths = useMemo(() => {
    if (!first) return [];
    const paths = parallel.filter(slot => last ? componentBoundary(slot, first) && componentBoundary(slot, last)
      : slot.componentIds.length === 1 && slot.componentIds[0] === first);
    return lc ? distinctLcParallelSlots(paths, membership) : paths;
  }, [first, last, parallel, lc, membership]);
  const activeGroup = groupPaths.length ? groupPaths[alternate % groupPaths.length] : undefined;
  const highlighted = new Set(preview?.kind === "parallel" ? preview.componentIds : activeGroup?.componentIds);
  const groupEndParts = useMemo(() => new Set(parallel
    .filter(slot => componentBoundary(slot, first))
    .flatMap(slot => [slot.componentIds[0], slot.componentIds.at(-1)])), [first, parallel]);
  const serial = useMemo(() => new Map(slots.flatMap(slot =>
    slot.kind === "series" ? [[slot.wireId, slot] as const] : [])), [slots]);
  const endpoints = useMemo(() => {
    return nets.flatMap(net => {
      const portTerminal = port?.terminals.find(id => net.includes(id));
      const portPoint = portTerminal ? diagram.endpoints.get(portTerminal) : undefined;
      if (portTerminal && portPoint) return [[portTerminal, portPoint] as const];
      const id = net.find(endpoint => diagram.endpoints.has(endpoint));
      if (!id) return [];
      return [[id, diagram.endpoints.get(id)!] as const];
    });
  }, [port, nets, diagram]);

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

  useEffect(() => { if (selectedWire) wireMenu.current?.querySelector("button")?.focus({ preventScroll: true }); }, [selectedWire]);
  useEffect(() => { if (confirmClear) clearMenu.current?.querySelector("button")?.focus({ preventScroll: true }); }, [confirmClear]);

  function closeWireMenu() {
    const buttons = field.current?.querySelectorAll<HTMLButtonElement>("[data-line-wire-control], [data-line-broken-wire]");
    const trigger = Array.from(buttons ?? []).find(button => (button.dataset.lineWireControl ?? button.dataset.lineBrokenWire) === selectedWire);
    (trigger ?? wireModeButton.current)?.focus({ preventScroll: true });
    setSelectedWire("");
    setInsertIntoWire(false);
  }

  function cancelClear() {
    clearButton.current?.focus({ preventScroll: true });
    setConfirmClear(false);
  }

  function applyEdit(command: TopologyCommand, source = document) {
    try {
      const session = new TopologySession(JSON.stringify(source));
      session.apply(command);
      if (session.document !== source && JSON.stringify(session.document) !== JSON.stringify(source)) onChange(session.document);
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }

  function removeSelected(mode: "device" | "branch" | "conductor" = automaticBypass ? "conductor" : "device") {
    if (onRemove) onRemove(selected, document);
    else {
      const source = physicalLine && !document.geometry
        ? { ...document, geometry: captureLineGeometry(topology, diagram) } : document;
      if (!applyEdit({ type: "remove", componentId: selected, mode, protectedEndpoints: [],
        preserveObservations: lc, allowPortShort: lc && !automaticBypass }, source)) return;
    }
    setSelected("");
    setConfirm(false);
  }

  function editWire(type: "break-wire" | "restore-wire", wireId: string) {
    let source = document;
    if (type === "break-wire" && !document.geometry) {
      source = { ...document, geometry: captureLineGeometry(topology, diagram) };
    }
    if (applyEdit({ type, wireId }, source)) {
      wireModeButton.current?.focus({ preventScroll: true });
      setSelectedWire("");
      setInsertIntoWire(false);
    }
  }

  function clearBoard() {
    if (!applyEdit({ type: "clear", retainedIds: port ? [port.id] : [] })) return;
    wireModeButton.current?.focus({ preventScroll: true });
    setConfirmClear(false);
    setSelected("");
    setSelectedWire("");
    setWireMode(false);
    setArmed(undefined);
    resetSelection();
  }

  function closeMenu() {
    setSelected("");
    setConfirm(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!selected) return;
    const anchor = trigger.current;
    const panel = menu.current;
    if (!anchor || !panel) return;
    function position() {
      const rect = anchor!.getBoundingClientRect();
      const width = panel!.offsetWidth;
      const height = panel!.offsetHeight;
      const nearby = Array.from(anchor!.closest(".line-experiment-editor")!
        .querySelectorAll<HTMLElement>("button:not([data-line-selected-part] button)"))
        .map(node => node.getBoundingClientRect());
      const rightEdge = Math.max(rect.right, ...nearby.filter(box => box.height && box.top >= rect.top - 190
        && box.bottom <= rect.bottom + 190).map(box => box.right));
      // Preserve the next selectable objects even when a wide inspector is open.
      const candidates = [
        { x: rect.left, y: rect.bottom + 6 }, { x: rect.left, y: rect.top - height - 6 },
        { x: rect.right + 6, y: rect.top - height / 2 }, { x: rect.left - width - 6, y: rect.top - height / 2 },
        { x: rightEdge + 8, y: rect.top },
      ].map(candidate => {
        const x = Math.max(8, Math.min(candidate.x, window.innerWidth - width - 8));
        const y = Math.max(8, Math.min(candidate.y, window.innerHeight - height - 8));
        const occluded = nearby.filter(box => x < box.right && x + width > box.left
          && y < box.bottom && y + height > box.top).length;
        const distance = Math.hypot(Math.max(0, rect.left - x - width, x - rect.right),
          Math.max(0, rect.top - y - height, y - rect.bottom));
        return { x, y, occluded, distance };
      });
      const [best] = candidates.sort((a,b) => a.occluded - b.occluded || a.distance - b.distance);
      setMenuPoint({ x: best.x, y: best.y });
    }
    function outside(event: PointerEvent) {
      if (!panel!.contains(event.target as Node) && !anchor!.contains(event.target as Node)) setSelected("");
    }
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.addEventListener("pointerdown", outside);
    panel.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("pointerdown", outside);
    };
  }, [selected]);

  function resetSelection() {
    setPreview(undefined);
    setPairMode(false);
    setFirst("");
    setLast("");
    setAlternate(0);
    setEndpoint("");
    setError(false);
  }

  function arm(part: PaletteItem) {
    const target = insertIntoWire && selectedWire ? serial.get(selectedWire) : undefined;
    if (target) { insert(target, undefined, undefined, part); return; }
    setWireMode(false);
    setSelectedWire("");
    setInsertIntoWire(false);
    setArmed(armed?.[0] === part[0] ? undefined : part);
    setSelected("");
    setConfirm(false);
    resetSelection();
  }

  function insert(slot: TopologySlot, session = new TopologySession(JSON.stringify(document)), target?: DirectTarget, item = armed) {
    if (!item) return;
    try {
      const component = makePart(topology, item, (document.brokenWires ?? []).map(wire => wire.id));
      session.apply({ type: "insert", slot, component: variable
        ? { ...component, parameters: { ...component.parameters, ohm: 25, nextOhm: 25 } } : component });
      // Keep the editable/archive document as the source of truth. The
      // renderer may derive a reduced visual projection, but insertion,
      // export, import and undo always retain the original components.
      const next = session.document;
      const geometry = geometryAfterInsertion(diagram, topology, next.topology, slot, component, target && {
        point: target.point, vertical: target.vertical, path: target.path }, brokenPaths);
      onChange(parseTopologyLabDocument(JSON.stringify({ ...next, geometry })));
      paletteControls.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      setArmed(undefined);
      setSelectedWire("");
      setInsertIntoWire(false);
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
      const differentPortOrder = endpoint === port?.terminals[1] && id === port?.terminals[0];
      const samePortOrder = endpoint === port?.terminals[0] && id === port?.terminals[1];
      const reverse = lc && (differentPortOrder || !samePortOrder && membership.get(endpoint)! > membership.get(id)!);
      const [from, to] = reverse ? [id, endpoint] : [endpoint, id];
      insert(session.crossSlot(from, to), session);
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
  const endpointTargets = pairMode && !lc
    ? new Map([...endpoints, ...diagram.junctions.map(({ id, x, y }) => [id, { x, y }] as const)]) : new Map(endpoints);
  const crossTargets = armed && (pairMode || !parallel.length) && !variable && !first ? [...endpointTargets] : [];
  const direct = armed && !pairMode && !variable && !first
    ? directTargets(document, diagram, parallel, first, port && { terminals: port.terminals, membership }) : [];
  const partTargets = armed && !variable && !endpoint && !(lc && pairMode) ? diagram.components.filter(({ id }) =>
    parallel.some(slot => componentBoundary(slot, id))) : [];
  const brokenPaths = (document.brokenWires ?? []).flatMap(wire => {
    const from = diagram.endpoints.get(wire.from);
    const to = diagram.endpoints.get(wire.to);
    if (!from || !to) return [];
    const turns = document.geometry?.bends[wire.id] ?? (from.x === to.x || from.y === to.y ? [] : [{ x: to.x, y: from.y }]);
    return [{ id: wire.id, wire, points: [from, ...turns, to], open: true }];
  });
  const wireChoices = wireMode && !armed ? [
    ...diagram.wires.filter(wire => wire.points.length > 1).map(wire => ({ ...wire, open: false })),
    ...brokenPaths,
  ] : [];
  const wireChoice = wireChoices.find(wire => wire.id === selectedWire);
  const targets = [...wireChoices.map(wire => ({ id: "wire:" + wire.id, points: wire.points })), ...seriesTargets, ...direct.map(({ slot, point }) => ({ id: slot.id, points: [point] })), ...crossTargets.map(([id, point]) => ({ id, points: [point] }))];
  const placement = placeLcCanvasTargets(targets, diagram.width, diagram.height, fieldScale, wireMode ? diagram.components : partTargets);
  const markerPoints = new Map(placement.markers.map(({ id, point }) => [id, point]));

  const endpointsToShow = preview?.boundaries.map(id => diagram.endpoints.get(id)).filter((p): p is Point => !!p) ?? [];
  const previewPath = direct.find(target => target.slot.id === preview?.id)?.path;
  function targetAt(clientX: number, clientY: number): DirectTarget | undefined {
    const rect = field.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const x = (clientX - rect.left) / fieldScale;
    const y = (clientY - rect.top) / fieldScale;
    const hit = window.document.elementFromPoint(clientX, clientY)?.closest<HTMLButtonElement>("[data-line-direct-slot],[data-line-series-slot]");
    if (hit && field.current?.contains(hit)) {
      const target = direct.find(t => t.slot.id === hit.dataset.lineDirectSlot);
      if (target) return target;
      const slot = serial.get(hit.dataset.lineSeriesSlot ?? "");
      if (slot) return { slot, point: { x, y }, vertical: false };
    }
    const matches = direct.map(target => ({ target, distance: Math.hypot(x - target.point.x, y - target.point.y) }));
    for (const wire of seriesTargets) {
      let distance = Infinity;
      for (let i = 1; i < wire.points.length; i++) {
        const a = wire.points[i - 1], b = wire.points[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        distance = Math.min(distance, Math.hypot(x - (a.x + u * dx), y - (a.y + u * dy)));
      }
      matches.push({ target: { slot: serial.get(wire.id)!, point: wireTarget(wire.points), vertical: false }, distance });
    }
    matches.sort((a, b) => a.distance - b.distance);
    const best = matches[0];
    if (best && best.distance * fieldScale <= 30 && (!matches[1] || (matches[1].distance - best.distance) * fieldScale > 3)) return best.target;
  }
  function insertionEvents(slot: TopologySlot, target?: DirectTarget) {
    return {
      onMouseEnter: () => setPreview(slot), onMouseLeave: () => setPreview(undefined),
      onFocus: () => setPreview(slot), onBlur: () => setPreview(undefined),
      onClick: () => insert(slot, undefined, target),
    };
  }

  return <section className="line-experiment-editor" inert={!viewportWidth} data-line-experiment-editor data-line-editor-variant={variant} aria-label={t.board}
    onKeyDown={event => {
      if ((selectedWire || confirmClear) && event.key === "Escape") {
        event.preventDefault();
        if (confirmClear) cancelClear();
        else closeWireMenu();
        return;
      }
      if (selected && event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
      if (selected && event.key === "Delete" && !(event.target instanceof HTMLInputElement)
        && (!canRemove || canRemove(selected))) {
        event.preventDefault(); removeSelected(); return;
      }
      if (armed && event.key === "Escape") {
        event.preventDefault();
        paletteControls.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
        arm(armed);
      }
    }}>
    <div className="line-experiment-editor-bar">
      <div className="line-experiment-editor-actions">
        {onAppendSection && !lc && (!steady || diagram.appendEndpoint) &&
          <button type="button" data-line-append data-line-append-endpoint={steady ? diagram.appendEndpoint : undefined}
            aria-label={appendLabel} title={appendLabel} onClick={() => onAppendSection(steady ? diagram.appendEndpoint : undefined)}>+ TL</button>}
        <strong>{t.board}</strong>
        {!variable && <button type="button" data-line-wire-mode ref={wireModeButton} aria-pressed={wireMode}
          onClick={() => {
            setWireMode(!wireMode); setSelectedWire(""); setInsertIntoWire(false);
            setSelected(""); setArmed(undefined); resetSelection();
          }}>{t.wires}</button>}
        {!variable && !emptyBoard &&
          <button type="button" data-line-clear ref={clearButton} aria-label={t.clear} title={t.clear}
            onClick={() => { setConfirmClear(true); setSelected(""); }}><Trash2 size={16} /></button>}
      </div>
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
      <div ref={field} className="line-experiment-field" style={{ width: diagram.width * fieldScale, height: placement.height * fieldScale }}>
        <svg viewBox={`0 0 ${diagram.width} ${placement.height}`} className="line-experiment-schematic" aria-hidden="true">
          {diagram.wires.map(({ id, points }) => <polyline key={id} data-line-wire={id}
            points={points.map(point => `${point.x},${point.y}`).join(" ")} />)}
          {previewPath && <polyline className="line-experiment-preview" points={previewPath.map(p => p.x + "," + p.y).join(" ")} />}
          {(previewPath ?? endpointsToShow).map((p, index) => <circle key={index} className="line-experiment-boundary" cx={p.x} cy={p.y} r={7} />)}
          {brokenPaths.map(({ id, points }) => <polyline key={id} className="line-experiment-open-wire"
            points={points.map(point => point.x + "," + point.y).join(" ")} />)}
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
            const physicalPins = part.kind === "line" && part.terminals.length === 4
              ? part.terminals.map(id => diagram.endpoints.get(id)) : undefined;
            return <g key={id} transform={`translate(${x} ${y})`} data-line-glyph={id}
              data-line-kind={part.kind} data-line-rotation={rotation} data-line-highlighted={highlighted.has(id) || undefined}>
              {highlighted.has(id) && <rect className="line-experiment-part-highlight"
                x={vertical ? -29 : -47} y={vertical ? -44 : -25} width={vertical ? 58 : 94} height={vertical ? 88 : 50} rx={8} />}
              {physicalPins?.every((point): point is Point => point !== undefined)
                ? <PhysicalLineGlyph terminals={part.terminals} pins={physicalPins.map(point => ({ x: point.x - x, y: point.y - y }))}
                    inputLabel={t.inputPair} outputLabel={t.outputPair} />
                : <g transform={`rotate(${part.kind === "line" && diagram.returnY !== undefined ? 0 : rotation})`}>
                    <LineGlyph part={part} railOffset={diagram.returnY === undefined ? undefined : diagram.returnY - y} />
                  </g>}
              <text x={vertical ? 31 : 0} y={vertical ? 5 : -21} textAnchor={vertical ? "start" : "middle"}>{displayName(id)}</text>
            </g>;
          })}
          {dots.map(({ id, x, y }) => <circle key={id} data-line-junction={id} cx={x} cy={y} r={3} className="line-experiment-dot" />)}
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
            const action = t.select;
            return <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-component={id}
              data-line-section={isSection && selectSection ? id : undefined} className="line-experiment-object"
              aria-label={`${action} ${displayName(id)}`} title={`${action} ${displayName(id)}`}
              aria-pressed={selected === id} onClick={event => {
                trigger.current = event.currentTarget;
                if (!sourceIds.has(id)) { setExpandedDocument(document); return; }
                if (isSection && selectSection) onOpenSection?.(id);
                setSelected(id); setConfirm(false);
              }} />;
          })}
          {!selectSection && !lc && diagram.components.filter(({ id }) => devices.get(id)?.kind === "line").map(({ id, x, y }) =>
            <CanvasButton key={id} point={{ x, y: y + 46 }} fieldScale={fieldScale} data-line-section={id}
              className="line-experiment-minor" aria-label={`${t.open} ${id}`} title={`${t.open} ${id}`} onClick={() => onOpenSection?.(id)}>▸</CanvasButton>)}
        </>}
        {wireChoices.map(wire => <CanvasButton key={wire.id}
          point={markerPoints.get("wire:" + wire.id) ?? wireTarget(wire.points)} fieldScale={fieldScale}
          data-line-wire-control={wire.open ? undefined : wire.id} data-line-broken-wire={wire.open ? wire.id : undefined}
          aria-label={t.wires + " · " + wire.id} aria-pressed={selectedWire === wire.id}
          onClick={() => { setSelected(""); setSelectedWire(wire.id); setInsertIntoWire(false); }}>
          {wire.open ? "×" : "⋯"}
        </CanvasButton>)}
        {armed && seriesTargets.map(({ id, points }) => {
          const slot = serial.get(id)!;
          return <CanvasButton key={id} point={markerPoints.get(id) ?? wireTarget(points)} fieldScale={fieldScale}
            data-line-series-slot={id} aria-label={`${t.add} ${armed[2]} · ${slot.boundaries.join(" / ")}`}
            data-lc-canvas-marker={lc || undefined} data-line-spaced-marker={variable || undefined}
            {...insertionEvents(slot)}>+</CanvasButton>;
        })}
        {armed && direct.map(target => {
          const { slot } = target;
          const point = markerPoints.get(slot.id) ?? target.point;
          const name = slot.kind === "parallel" ? slot.componentIds.join(" + ") : slot.boundaries.join(" / ");
          const label = target.wholePort ? t.wholeParallel : t.parallel + " · " + name;
          return <CanvasButton key={slot.id} point={point} fieldScale={fieldScale} data-line-direct-slot={slot.id}
            data-lc-whole-parallel={target.wholePort || undefined} data-lc-parallel-pair={target.netPair}
            aria-label={label} title={label} {...insertionEvents(slot, target)}>∥</CanvasButton>;
        })}
        {partTargets.map(({ id, x, y }) =>
          <CanvasButton key={id} point={{ x, y }} fieldScale={fieldScale} data-line-parallel-part={id}
            className="line-experiment-object" aria-label={`${t.select} ${id}`}
            aria-pressed={id === first || id === last} onClick={() => selectParallel(id)} />)}
        {armed && focusPoint && activeGroup && <>
          {!lc && <CanvasButton point={{ x: groupControlsX(focusPoint.x - 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="left" aria-label={t.left} title={t.left} onClick={() => insertParallel("left")}>←+</CanvasButton>}
          <CanvasButton point={{ x: groupControlsX(focusPoint.x + 33 / fieldScale), y: groupControlsY }} fieldScale={fieldScale}
            data-line-parallel-side="right" aria-label={lc ? t.parallel : t.right} title={lc ? t.parallel : t.right}
            onClick={() => insertParallel("right")}>{lc ? "∥" : "+→"}</CanvasButton>
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
    {armed && !variable && !pairMode && diagram.returnY !== undefined && <span className="line-experiment-editor-note">
      {language === "ru" ? "Для ответвления вокруг участка выберите его крайние элементы на схеме." : "Для відгалуження навколо ділянки виберіть її крайні елементи на схемі."}
    </span>}
    {armed && !variable && <button type="button" className="line-experiment-pair" aria-pressed={pairMode}
      onClick={() => { resetSelection(); setPairMode(!pairMode); }}>{language === "ru" ? "Выбрать два узла" : "Вибрати два вузли"}</button>}
    {armed && <p className="line-experiment-editor-note" role="status">{hasError ? t.invalid
      : variable ? (seriesTargets.length ? t.search.series : t.empty) : endpoint ? t.search.cross : first ? t.search.parallel : pairMode ? t.search.cross : (language === "ru" ? "+ — последовательно, ∥ — параллельно участку." : "+ — послідовно, ∥ — паралельно ділянці.")}</p>}
    {confirmClear && <div className="line-experiment-operation" ref={clearMenu} role="group" aria-label={t.clear}>
      <span>{t.confirmClear}</span>
      <button type="button" data-line-confirm-clear onClick={clearBoard}>{t.clear}</button>
      <button type="button" onClick={cancelClear}>{t.cancel}</button>
    </div>}
    {wireChoice && <div className="line-experiment-operation" ref={wireMenu} role="group" aria-label={t.wires + " · " + wireChoice.id}>
      <strong>{wireChoice.id}</strong>
      {wireChoice.open
        ? <button type="button" data-line-restore-wire onClick={() => editWire("restore-wire", wireChoice.id)}>{t.restoreWire}</button>
        : <>
          {serial.has(wireChoice.id) && <button type="button" data-line-wire-insert onClick={() => {
            setInsertIntoWire(true);
            paletteControls.current?.querySelector("button")?.focus();
          }}>{t.insertIntoWire}</button>}
          <button type="button" data-line-break-wire onClick={() => editWire("break-wire", wireChoice.id)}>{t.breakWire}</button>
        </>}
      {insertIntoWire && <span role="status">{t.choosePart}</span>}
      <button type="button" onClick={closeWireMenu}>{t.cancel}</button>
    </div>}
    {!variable && emptyBoard &&
      <div className="line-experiment-operation" data-line-empty>
        <span>{t.emptyBoard}</span>
        {onRestoreStarter && <button type="button" onClick={onRestoreStarter}>{t.starter}</button>}
      </div>}
    {!armed && hasError && <p className="line-experiment-editor-note" role="alert">{t.operationError}</p>}
    {selectedPart && !armed && <div className="line-experiment-selection" role="dialog" aria-label={selected} ref={menu}
      tabIndex={-1} style={{ left: menuPoint.x, top: menuPoint.y }} data-line-selected-part={selectedPart.id}>
      {(!selectSection && !lc || !renderInspector) && <strong>{selectedPart.id}</strong>}
      {!steady && selectedPart.kind === "switch" && <SwitchTime key={`${selectedPart.id}:${selectedPart.parameters.atS}`}
        part={selectedPart} label={selectedPart.parameters.closes === true ? t.closeTime : t.time} onSave={updateSwitchTime} />}
      {variant === "transient" && <TransientParameters language={language} part={selectedPart} onSave={(key, value) => {
        const next = parseTopologyLabDocument(JSON.stringify({ ...document, topology: { ...topology,
          components: topology.components.map(part => part.id === selectedPart.id
            ? { ...part, parameters: { ...part.parameters, [key]: value } } : part) } }));
        validateParameters?.(next);
        onChange(next);
      }} />}
      {renderInspector?.(selectedPart)}
      <button type="button" aria-label={language === "ru" ? "Закрыть" : "Закрити"} onClick={closeMenu}><X size={16} /></button>
      {(!canRemove || canRemove(selected)) && (confirm ? <>
        <button type="button" data-line-confirm-remove onClick={() => removeSelected()}>{t.confirm} {selected}</button>
        {explicitBypass && !automaticBypass && <button type="button" data-line-replace-conductor onClick={() => removeSelected("conductor")}>{t.bypass}</button>}
        {removableBranch && <button type="button" data-line-remove-branch onClick={() => removeSelected("branch")}>
          {t.removeBranch} ({removableBranch.join(" + ")})
        </button>}
        <button type="button" onClick={() => setConfirm(false)}>{t.cancel}</button>
      </> : <button type="button" data-line-remove aria-label={`${t.remove} ${selected}`}
        onClick={() => setConfirm(true)} title={t.remove}><Trash2 size={16} /></button>)}
    </div>}
    <div ref={paletteControls} className="line-experiment-palette" role="group" aria-label={t.palette}>
      {palette.slice(paletteStart, paletteEnd).map((item, index) => <button key={item[0]} type="button" data-line-palette={item[0]}
        title={t.names[index + paletteStart]} aria-label={t.names[index + paletteStart]} aria-pressed={armed?.[0] === item[0]}
        onPointerDown={e => {
          if (!e.isPrimary || e.button !== 0) return;
          dragTouch.current = { id: e.pointerId, start: { x: e.clientX, y: e.clientY }, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }} onPointerMove={e => {
          const drag = dragTouch.current;
          if (!drag || e.pointerId !== drag.id) return;
          if (!drag.moved && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 8) {
            drag.moved = true; setArmed(item); setSelected(""); resetSelection();
          }
          if (drag.moved) setPreview(targetAt(e.clientX, e.clientY)?.slot);
        }} onPointerUp={e => {
          const drag = dragTouch.current;
          dragTouch.current = null;
          if (!drag?.moved) return;
          suppressClick.current = true;
          window.setTimeout(() => { suppressClick.current = false; }, 0);
          const target = targetAt(e.clientX, e.clientY);
          if (target) insert(target.slot, undefined, target);
          else { setArmed(undefined); setPreview(undefined); }
        }} onPointerCancel={() => {
          if (dragTouch.current?.moved) { setArmed(undefined); setPreview(undefined); }
          dragTouch.current = null;
        }}
        onClick={() => { if (!suppressClick.current) arm(item); }}>
        {item[1] === "switch" ? <svg viewBox="0 0 30 20" aria-hidden="true">
          <path d={item[0] === "switch-open" ? "M0 12H8L21 5M22 12H30" : "M0 12H30"} />
          <circle cx="8" cy="12" r="1.5" /><circle cx="22" cy="12" r="1.5" />
        </svg> : item[2]}
      </button>)}
    </div>
  </section>;
}
