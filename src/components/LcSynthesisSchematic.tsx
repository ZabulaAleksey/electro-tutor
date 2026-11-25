import { useState } from "react";
import { formatEngineeringValue } from "../engineering/format";
import { CapacitorGlyph, InductorGlyph } from "../engineering/symbols";
import type { CauerElement } from "../models/reactive-cauer-i";
import type { FosterITerm } from "../models/reactive-foster-i";
import type { FosterIITerm } from "../models/reactive-foster-ii";
import type { Language } from "../types";

type FosterTerm = FosterITerm | FosterIITerm;
type Synthesis =
  | { form: "foster-i" | "foster-ii"; terms: readonly FosterTerm[] }
  | { form: "cauer-i" | "cauer-ii"; elements: readonly CauerElement[] };
type Point = readonly [number, number];
type Element = { kind: "l" | "c"; valueSI: number; name: string };
type Placement = Element & { from: Point; to: Point };
type Drawing = {
  width: number;
  height: number;
  ports: readonly [Point, Point];
  wires: Point[][];
  junctions: Point[];
  parts: Placement[];
};

export function LcSynthesisNominal({ value, unit, language }: { value: number; unit: "H" | "F"; language: Language }) {
  const [label, symbol] = formatEngineeringValue(value, unit, language).split("\u00a0");
  return <>{label}{" "}<span className="lc-synthesis-unit">{symbol}</span></>;
}

function fosterElements(terms: readonly FosterTerm[]) {
  return terms.map((term, index) => {
    const parts: Element[] = [];
    if ("henry" in term) parts.push({ kind: "l", valueSI: term.henry, name: "L" + (index + 1) });
    if ("farad" in term) parts.push({ kind: "c", valueSI: term.farad, name: "C" + (index + 1) });
    return parts;
  });
}

function fosterSeries(terms: readonly FosterTerm[]): Drawing {
  const cells = fosterElements(terms);
  const pitch = 72;
  const paired = cells.some(parts => parts.length === 2);
  const main = paired ? 85 : 48;
  const first = 23;
  const last = first + cells.length * pitch;
  const ports: Drawing["ports"] = [[8, main], [last + 15, main]];
  const drawing: Drawing = {
    width: last + 24, height: paired ? 150 : 72, ports,
    wires: [[ports[0], [first, main]], [[last, main], ports[1]]], junctions: [], parts: [],
  };
  for (const [index, elements] of cells.entries()) {
    const start = first + index * pitch;
    const end = start + pitch;
    if (elements.length === 1) {
      drawing.parts.push({ ...elements[0], from: [start, main], to: [end, main] });
      continue;
    }
    const upper = 46, lower = 124;
    const left = start + 9, right = end - 9;
    drawing.wires.push([[start, main], [left, main]], [[right, main], [end, main]],
      [[left, upper], [left, lower]], [[right, upper], [right, lower]]);
    drawing.junctions.push([left, main], [right, main]);
    drawing.parts.push({ ...elements[0], from: [left, upper], to: [right, upper] },
      { ...elements[1], from: [left, lower], to: [right, lower] });
  }
  return drawing;
}

function fosterParallel(terms: readonly FosterTerm[]): Drawing {
  const cells = fosterElements(terms);
  const pitch = 76;
  const first = 25;
  const last = first + Math.max(0, cells.length - 1) * pitch;
  const upper = 23, lower = cells.some(parts => parts.length === 2) ? 154 : 101;
  const ports: Drawing["ports"] = [[9, upper], [9, lower]];
  const drawing: Drawing = {
    width: last + 80, height: lower + 21, ports,
    wires: [[ports[0], [last, upper]], [ports[1], [last, lower]]], junctions: [], parts: [],
  };
  for (const [index, parts] of cells.entries()) {
    const x = first + index * pitch;
    const span = (lower - upper) / parts.length;
    parts.forEach((part, i) => drawing.parts.push({ ...part, from: [x, upper + i * span], to: [x, upper + (i + 1) * span] }));
    if (index < cells.length - 1) drawing.junctions.push([x, upper], [x, lower]);
  }
  return drawing;
}

function cauerLadder(elements: readonly CauerElement[]): Drawing {
  const first = 24, upper = 46, lower = 113;
  const ports: Drawing["ports"] = [[9, upper], [9, lower]];
  const drawing: Drawing = {
    width: 0, height: 134, ports, wires: [[ports[0], [first, upper]]], junctions: [], parts: [],
  };
  let x = first;
  for (const [index, element] of elements.entries()) {
    const part = { kind: element.kind, valueSI: element.valueSI, name: element.kind.toUpperCase() + (index + 1) };
    if (element.placement === "series") {
      drawing.parts.push({ ...part, from: [x, upper], to: [x + 72, upper] });
      x += 72;
    } else {
      drawing.parts.push({ ...part, from: [x, upper], to: [x, lower] });
      if (index < elements.length - 1) drawing.junctions.push([x, upper], [x, lower]);
    }
  }
  const endsInSeries = elements.at(-1)?.placement === "series";
  drawing.wires.push([ports[1], [x, lower]]);
  if (endsInSeries) drawing.wires.push([[x, upper], [x, lower]]);
  drawing.width = x + (endsInSeries ? 20 : 77);
  return drawing;
}

function Device({ part, language }: { part: Placement; language: Language }) {
  const [x1, y1] = part.from, [x2, y2] = part.to;
  const x = (x1 + x2) / 2, y = (y1 + y2) / 2;
  const horizontal = y1 === y2;
  const span = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  const scale = .66, halfCoil = 27 * scale;
  const nominal = formatEngineeringValue(part.valueSI, part.kind === "l" ? "H" : "F", language);
  const labelX = horizontal ? x : x + 14;
  return <g data-lc-symbol={part.kind} data-lc-synthesis-label={part.name} data-lc-synthesis-si={part.valueSI}>
    <title>{part.name} · {nominal}</title>
    {part.kind === "l" ? <g transform={`translate(${x} ${y})${horizontal ? "" : " rotate(90)"}`}>
      <path d={`M${-span / 2} 0H${-halfCoil}M${halfCoil} 0H${span / 2}`} />
      <InductorGlyph x={-halfCoil} y={0} scale={scale} mode="thumbnail" />
    </g> : <CapacitorGlyph x={x} y={y} scale={scale} mode="thumbnail"
      orientation={horizontal ? "horizontal" : "vertical"} terminalSpan={span / scale} />}
    <text x={labelX} y={y - (horizontal ? 26 : 3)} textAnchor={horizontal ? "middle" : "start"}>
      <tspan className="lc-synthesis-designator">{part.name}</tspan>
      <tspan x={labelX} dy="11" textLength={nominal.length > 12 ? 62 : undefined}
        lengthAdjust={nominal.length > 12 ? "spacingAndGlyphs" : undefined}>{nominal}</tspan>
    </text>
  </g>;
}

export function LcSynthesisSchematic({ language, synthesis }: { language: Language; synthesis: Synthesis }) {
  const [fit, setFit] = useState(false);
  const drawing = "elements" in synthesis ? cauerLadder(synthesis.elements)
    : synthesis.form === "foster-i" ? fosterSeries(synthesis.terms) : fosterParallel(synthesis.terms);
  const scalable = drawing.width > 352;
  const fullScale = scalable && !fit;
  const label = language === "ru" ? "Схема двухполюсника" : "Схема двополюсника";
  return <>
    {scalable && <button type="button" className="lc-synthesis-action" aria-pressed={fit} onClick={() => setFit(!fit)}>
      {language === "ru" ? "Вписать схему" : "Умістити схему"}
    </button>}
    <div className="lc-synthesis-schematic" data-wide={fullScale || undefined}
      tabIndex={fullScale ? 0 : undefined} role={fullScale ? "region" : undefined} aria-label={fullScale ? label : undefined}>
      <svg className="lc-schematic" width={drawing.width} height={drawing.height}
        style={{ width: drawing.width }} viewBox={`0 0 ${drawing.width} ${drawing.height}`}
        role="img" aria-label={label}>
        {drawing.wires.map((points, index) =>
          <polyline points={points.map(point => point.join(",")).join(" ")} key={index} />)}
        {drawing.parts.map(part => <Device part={part} language={language} key={part.name} />)}
        {drawing.junctions.map(([x, y]) => <circle key={x + "," + y} data-lc-synthesis-junction cx={x} cy={y} r="2.2" fill="currentColor" stroke="none" />)}
        {drawing.ports.map(([x, y], index) => <g key={index}>
          <circle cx={x} cy={y} r="3" fill="var(--surface-plot)" />
          <text x={x} y={y - 8} textAnchor="middle">{index === 0 ? "a" : "b"}</text>
        </g>)}
      </svg>
    </div>
  </>;
}
