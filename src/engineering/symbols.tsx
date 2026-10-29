import type { ReactNode } from "react";
export type SymbolMode = "full" | "thumbnail" | "export";
export type SymbolProps = { x: number; y: number; scale?: number; mode?: SymbolMode; label?: ReactNode };
type Orientation = "horizontal" | "vertical";
const resistorSource = "https://ng-kg.kpi.ua/files/Pervertun_Nadkernichna1.pdf#page=10";
export const SYMBOL_PROVENANCE = {
  resistorCapacitor: { standard: "ГОСТ 2.728-74", status: "Действует (карточка Росстандарта, 2026-10-29)", source: "https://protect.gost.ru/gost/details/ba115ccd-e5aa-4ba1-a672-b17170f1a7f2" },
  semiconductor: { standard: "ГОСТ 2.730-73", source: "https://protect.gost.ru/gost/details/8e7d0ff4-ab0d-44b5-8efd-b0fcdb13950b" },
  dimensions: { standard: "ГОСТ 2.747-68", source: "https://protect.gost.ru/gost?month=0&page=10&search=&year=0", limitations: "Не использовать исключённые позиции 24/25 для размеров R/C; действует профиль 2.728." },
} as const;
export const SYMBOL_GEOMETRY = {
  resistor: { width: 40, height: 16, terminals: [[0, 0], [58, 0]], provenance: { source: resistorSource, standard: "ГОСТ 2.728-74", limitations: "Body ratio10:4 confirmed KPI p10; selected4 SVG units/reference mm, not physical screen mm. Lead span is layout-specific." } },
  capacitor: { plateLength: 32, gap: 8, terminals: [[0, -10], [0, 10]], provenance: { source: SYMBOL_PROVENANCE.resistorCapacitor.source, limitations: "Equal plates;32:8 chosen product profile, no claim sole mandatory normative gap." } },
  diode: { width: 20, height: 16, terminals: [[0, 0], [23, 0]], provenance: { source: SYMBOL_PROVENANCE.semiconductor.source, limitations: "General diode shape and polarity;20:16 product profile, no claim mandatory mm." } },
  source: { radius: 22, terminals: [[0, -22], [0, 22]], provenance: { limitations: "Ideal voltage/current model source, explicit polarity/direction; not a physical battery symbol." } },
  support: { triangleHalfWidth: 16, triangleHeight: 24, hatchPitch: 8, hatchAngle: 45, provenance: { limitations: "Textbook calculation symbol, product-selected SVG dimensions; fixed/pin/roller constraint semantics are numerical, no fabricated GOST size." } },
} as const;

/** Coordinates are absolute for parser/port verification. Scale multiplies the
 * complete glyph, including stroke, while terminalSpan only changes wire leads. */
export function ResistorGlyph({ x, y, scale = 1, mode = "full", label, orientation = "horizontal", terminalSpan = 58 }: SymbolProps & { orientation?: Orientation; terminalSpan?: number }) {
  const w = 40 * scale, h = 16 * scale, length = terminalSpan * scale, lead = (length - w) / 2, vertical = orientation === "vertical";
  return <g data-symbol="resistor" data-mode={mode} data-orientation={orientation} data-terminals={vertical ? `${x},${y};${x},${y + length}` : `${x},${y};${x + length},${y}`} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="var(--white)">
    <path d={vertical ? `M${x} ${y}V${y + lead} M${x} ${y + lead + w}V${y + length}` : `M${x} ${y}H${x + lead} M${x + lead + w} ${y}H${x + length}`} fill="none" />
    <rect x={vertical ? x - h / 2 : x + lead} y={vertical ? y + lead : y - h / 2} width={vertical ? h : w} height={vertical ? w : h} />
    {label && <text x={vertical ? x + 10 * scale : x + length / 2} y={vertical ? y + length / 2 : y - 15 * scale} textAnchor={vertical ? "start" : "middle"} stroke="none" fill="var(--ink)">{label}</text>}
  </g>;
}
export function CapacitorGlyph({ x, y, scale = 1, mode = "full", label, orientation = "vertical", terminalSpan = 20 }: SymbolProps & { orientation?: Orientation; terminalSpan?: number }) {
  const plate = 16 * scale, gap = 4 * scale, terminal = terminalSpan / 2 * scale, vertical = orientation === "vertical";
  return <g data-symbol="capacitor" data-terminals={vertical ? `${x},${y-terminal};${x},${y+terminal}` : `${x-terminal},${y};${x+terminal},${y}`} data-mode={mode} data-orientation={orientation} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="none">
    <path d={vertical ? `M${x - plate} ${y - gap}H${x + plate} M${x - plate} ${y + gap}H${x + plate} M${x} ${y - terminal}V${y - gap} M${x} ${y + gap}V${y + terminal}` : `M${x - gap} ${y - plate}V${y + plate} M${x + gap} ${y - plate}V${y + plate} M${x - terminal} ${y}H${x - gap} M${x + gap} ${y}H${x + terminal}`} />
    {label && <text x={x + 23 * scale} y={y + 5 * scale} stroke="none" fill="var(--ink)">{label}</text>}
  </g>;
}
export function DiodeGlyph({ x, y, scale = 1, mode = "full", label }: SymbolProps) {
  const p = (v: number) => x + v * scale, py = (v: number) => y + v * scale;
  return <g data-symbol="diode" data-terminals={`${x},${y};${p(23)},${y}`} data-mode={mode} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="var(--white)"><path d={`M${x} ${py(-8)}L${p(20)} ${y}L${x} ${py(8)}L${x} ${py(-8)} M${p(20)} ${py(-8)}V${py(8)} M${p(20)} ${y}H${p(23)}`} />{label && <text x={p(24)} y={py(24)} stroke="none" fill="var(--ink)">{label}</text>}</g>;
}
export function SourceGlyph({ x, y, scale = 1, mode = "full", label, ac = false, current = false }: SymbolProps & { ac?: boolean; current?: boolean }) {
  return <g data-symbol={current ? "current-source" : ac ? "ac-source" : "dc-source"} data-terminals={`${x},${y-22*scale};${x},${y+22*scale}`} data-mode={mode} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="var(--white)">
    <circle cx={x} cy={y} r={22 * scale} />
    {current ? <path d={`M${x} ${y + 12 * scale}V${y - 12 * scale} M${x - 4 * scale} ${y - 6 * scale}L${x} ${y - 12 * scale}L${x + 4 * scale} ${y - 6 * scale}`} fill="none" /> : ac ? <text x={x} y={y + 5 * scale} textAnchor="middle" stroke="none" fill="var(--ink)">∿</text> : <><text x={x} y={y - 5 * scale} textAnchor="middle" stroke="none" fill="var(--ink)">+</text><text x={x} y={y + 13 * scale} textAnchor="middle" stroke="none" fill="var(--ink)">−</text></>}
    {label && <text x={x - 32 * scale} y={y + 64 * scale} stroke="none" fill="var(--ink)">{label}</text>}
  </g>;
}
export function InductorGlyph({ x, y, scale = 1, mode = "full", label }: SymbolProps) {
  return <g data-symbol="inductor" data-terminals={`${x},${y};${x+54*scale},${y}`} data-mode={mode} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="none"><path d={`M${x} ${y} a${9 * scale} ${13 * scale} 0 0 1 ${18 * scale} 0 a${9 * scale} ${13 * scale} 0 0 1 ${18 * scale} 0 a${9 * scale} ${13 * scale} 0 0 1 ${18 * scale} 0`} />{label && <text x={x + 27 * scale} y={y - 18 * scale} textAnchor="middle" stroke="none" fill="var(--ink)">{label}</text>}</g>;
}
export function MotorGlyph({ x, y, scale = 1, mode = "full", label = "M" }: SymbolProps) { return <g data-symbol="motor" data-terminals={`${x},${y-22*scale};${x},${y+22*scale}`} data-mode={mode} stroke="var(--ink)" strokeWidth={1.7 * scale} fill="var(--white)"><circle cx={x} cy={y} r={22 * scale} /><text x={x} y={y + 5 * scale} textAnchor="middle" fill="var(--ink)" stroke="none">{label}</text></g>; }
export type SupportKind = "fixed-left" | "fixed-right" | "pin" | "roller";
export function SupportGlyph({ x, y, scale = 1, mode = "full", kind }: SymbolProps & { kind: SupportKind }) {
  const fixed = kind.startsWith("fixed"), roller = kind === "roller", ground = roller ? 38 : 29;
  return <g data-symbol="support" data-support={kind} data-mode={mode} transform={`translate(${x} ${y}) scale(${scale})`} stroke="var(--ink)" strokeWidth="1.7" fill="none" strokeLinejoin="miter">
    {fixed ? <g transform={kind === "fixed-right" ? "scale(-1 1)" : undefined}><path d="M0 -28V28" strokeWidth="3" />{[-24, -16, -8, 0, 8, 16, 24].map(v => <path key={v} d={`M-10 ${v + 10}L0 ${v}`} />)}</g> : <><path d="M0 0L-16 24H16L0 0" />{roller && <><circle cx="-9" cy="30" r="4" /><circle cx="9" cy="30" r="4" /></>}<path d={`M-24 ${ground}H24`} />{[-20, -12, -4, 4, 12, 20].map(v => <path key={v} d={`M${v} ${ground}l-6 6`} />)}<circle r="3" fill="var(--white)" /></>}
  </g>;
}

/** General complex impedance is a two-terminal block, not a claim that Z is R. */
export function ImpedanceGlyph({x,y,mode="full",width=82}:SymbolProps&{width?:number}) {
 return <g data-symbol="impedance" data-mode={mode} data-terminals={`${x},${y};${x+width},${y}`} fill="var(--white)" stroke="var(--ink)" strokeWidth="2.3"><rect x={x} y={y-12} width={width} height="24"/></g>;
}
/** Reference-specific labelled EMF source; preserves the lesson's E1/E2 notation.
 * Polarity is not invented when the source reference does not specify it. */
export function ReferenceEmfGlyph({x,y,mode="full"}:SymbolProps) {
 return <g data-symbol="reference-emf" data-mode={mode} data-terminals={`${x},${y-30};${x},${y+30}`} fill="var(--white)" stroke="var(--ink)" strokeWidth="2.5"><circle cx={x} cy={y} r="30"/></g>;
}
