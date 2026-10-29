import { useId } from "react";
import type { Language } from "../types";
import type { MicroLab } from "./micro-catalog";
import { microCopy } from "./micro-catalog";
import type { MicroModel } from "./micro-models";
import { formatEngineeringNumber } from "../engineering/format";
import EngineeringPlot from "../engineering/EngineeringPlot";
import { ResistorGlyph, CapacitorGlyph, DiodeGlyph, SourceGlyph, InductorGlyph, MotorGlyph } from "../engineering/symbols";

/** Neutral schematic symbols; colour reserved for selected measurements. */
export function CircuitView({ lab, a, b, language }: { lab: MicroLab; a: number; b: number; language: Language }) {
  const n=(v:number,digits=2)=>formatEngineeringNumber(v,language,{maximumFractionDigits:digits});
  const kind = lab.model, id = useId().replace(/:/g, ""), arrow = `micro-arrow-${id}`;
  const capacitor = kind === "charge" || kind === "discharge" || kind === "filter";
  const source = kind === "ohm" ? `U = ${n(a)} V` : kind === "diode" ? `E = ${n(a)} V` : kind === "drive" ? `U = ${n(a)} V` : capacitor ? kind === "filter" ? "U = 1 V RMS" : "E = 12 V" : "E = 24 V";
  function resistor(x: number, label: string, width = 58) { return <ResistorGlyph x={x} y={31} terminalSpan={width} label={label} mode="thumbnail" />; }
  const parallel = kind === "parallel", three = kind === "star", special = parallel || three || kind === "rms" || kind === "control" || kind === "reflection";
  return <svg viewBox="0 0 380 145" className="micro-circuit" role="img" aria-label={`${microCopy[language].scheme}: ${lab.title[language]}`}>
    <defs><marker id={arrow} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.2" /></marker></defs>
    <g stroke="var(--ink)" strokeWidth="1.7" fill="none" strokeLinejoin="round">
      {!special && <>
        <path d={`M36 31 H${kind === "resonance" ? 95 : 115} M${kind === "resonance" ? 145 : 173} 31 H${kind === "resonance" ? 180 : kind === "divider" || kind === "power" || kind === "diode" ? 235 : 314}`} />
        {kind === "divider" || kind === "power" ? <><path d="M293 31 H314 V115 H36 V95 M36 51 V31" />{resistor(115, kind === "power" ? `r = ${n(a)} Ω` : `R₁ = ${n(a)} Ω`)}{resistor(235, kind === "power" ? `Rᴸ = ${n(b)} Ω` : `R₂ = ${n(b)} Ω`)}<circle cx="204" cy="31" r="3" fill="var(--ink)" />{kind === "divider" && <text x="237" y="59">+ U₂ −</text>}</> : kind === "resonance" ? <><path d="M234 31 H271 M283 31 H314 V115 H36 V95 M36 51 V31" /><InductorGlyph x={180} y={31} mode="thumbnail"/><CapacitorGlyph x={277} y={31} orientation="horizontal" terminalSpan={16} scale={.75} mode="thumbnail"/>{resistor(95, `R = ${n(b)} Ω`, 50)}<text x="202" y="15" textAnchor="middle">{n(.2)} H</text><text x="279" y="15" textAnchor="middle">100 µF</text></> : kind === "diode" ? <><path d="M258 31 H314 V115 H36 V95 M36 51 V31" /><DiodeGlyph x={235} y={31} mode="thumbnail"/>{resistor(115, `R = ${n(b)} Ω`)}<text x="277" y="60">D</text><text x="237" y="100">+ uD −</text></> : capacitor ? <><path d="M314 31 V62 M314 82 V115 H36" /><CapacitorGlyph x={314} y={72} mode="thumbnail"/>{kind === "discharge" ? <path d="M36 115 V31" /> : <path d="M36 115 V95 M36 51 V31" />}{resistor(115, kind === "filter" ? "R = 1 kΩ" : `R = ${n(a)} Ω`)}<text x="333" y="72">+</text><text x="333" y="96">−</text><text x="220" y="135">C = {n(b)} µF</text><circle cx="314" cy="50" r="3" fill="var(--green)" stroke="var(--green)" /><text x="232" y="78" fill="var(--blue)" stroke="none">uC</text></> : kind === "drive" ? <><path d="M314 31 V51 M314 95 V115 H36 V95 M36 51 V31" />{resistor(115, "Ra = 1 Ω")}<MotorGlyph x={314} y={73} mode="thumbnail"/><path d="M337 73 H365" markerEnd={`url(#${arrow})`} /><text x="272" y="135">Mᴸ = {n(b)} N·m</text></> : <><path d="M314 31 V115 H36 V95 M36 51 V31" />{resistor(115, `R = ${n(b)} Ω`)}</>}
        {kind !== "discharge" && <><SourceGlyph x={36} y={73} ac={kind === "resonance" || kind === "filter"} mode="thumbnail"/><text x="4" y="137">{kind === "resonance" ? "230 V RMS" : source}</text></>}
        <path d={kind === "discharge" ? "M201 73 H139" : "M145 73 H207"} stroke="var(--blue)" markerEnd={`url(#${arrow})`} /><text x="173" y="97" textAnchor="middle" stroke="none" fill="var(--blue)">{kind === "discharge" ? "iR ←" : "iR →"}</text>
      </>}
      {parallel && <><path d="M36 25 H315 V54 M315 84 V115 H36 V95 M36 51 V25 M164 25 V54 M164 84 V115" /><SourceGlyph x={36} y={73} current mode="thumbnail"/><ResistorGlyph x={164} y={54} orientation="vertical" terminalSpan={50} scale={.6} mode="thumbnail"/><ResistorGlyph x={315} y={54} orientation="vertical" terminalSpan={50} scale={.6} mode="thumbnail"/>{[164, 315].map(x => <g key={x}><circle cx={x} cy="25" r="3" fill="var(--ink)" /><circle cx={x} cy="115" r="3" fill="var(--ink)" /></g>)}<text x="4" y="137">Is = 1 A</text><text x="130" y="46">R₁ = {n(a)} Ω</text><text x="270" y="46">R₂ = {n(b)} Ω</text><text x="180" y="103">I₁ ↓</text><text x="330" y="103">I₂ ↓</text></>}
      {three && <>{[28, 66, 104].map((y, k) => <g key={y}><path d={`M46 ${y} H162 M220 ${y} H309 V66`} /><ResistorGlyph x={162} y={y} mode="thumbnail"/><text x="27" y={y + 5}>{"ABC"[k]}</text><text x="125" y={y - 10}>I{"ABC"[k]} →</text></g>)}<path d="M46 130 H309 V66" /><circle cx="309" cy="66" r="3" fill="var(--ink)" /><circle cx="309" cy="104" r="3" fill="var(--ink)" /><text x="27" y="135">N</text><text x="328" y="70">n</text><text x="75" y="141">Uφ = {n(a)} V · Rφ = {n(b)} Ω</text></>}
      {kind === "rms" && <><path d="M40 75 H335 M65 25 V123" stroke="var(--muted)" /><path d={`M65 75 Q93 ${75 - a} 121 75 T177 75 T233 75 T289 75`} stroke="var(--blue)" strokeWidth="2.3" /><text x="65" y="18">Û = {n(a)} V</text><text x="230" y="135">f = {n(b)} Hz</text><text x="339" y="79">t</text></>}
      {kind === "control" && <><path d="M20 95 H45 V55 H105 M105 75 H139 M285 75 H355" markerEnd={`url(#${arrow})`} /><rect x="139" y="40" width="146" height="70" rx="2" /><text x="212" y="69" textAnchor="middle">K = {n(a)}</text><text x="212" y="92" textAnchor="middle">τ = {n(b)} s</text><text x="20" y="32">u = 1(t)</text><text x="324" y="53">y(t)</text></>}
      {kind === "reflection" && <><path d="M30 38 H90 M140 38 H307 V59 M307 90 V115 H30 V96 M30 52 V38" /><SourceGlyph x={30} y={74} mode="thumbnail"/><ResistorGlyph x={90} y={38} terminalSpan={50} mode="thumbnail"/><ResistorGlyph x={307} y={59} terminalSpan={50} scale={.62} orientation="vertical" mode="thumbnail"/><text x="94" y="18">Rs = Z₀</text><text x="225" y="18">Rᴸ = {n(a)} Ω</text><path d="M171 50 H263" stroke="var(--blue)" markerEnd={`url(#${arrow})`} /><path d="M263 101 H171" stroke="var(--orange)" strokeDasharray="5 3" markerEnd={`url(#${arrow})`} /><text x="174" y="82">Z₀ = {n(b)} Ω</text><text x="22" y="139">E = 100 V</text><text x="200" y="139">l = 100 km</text></>}
    </g>
  </svg>;
}

export function LivePlot({ view, language, paper = false }: { view: MicroModel; language: Language; paper?:boolean }) {
  const copy=microCopy[language];
  const label=view.plot.xLabel.startsWith("f,")?(view.plot.yLabel.startsWith("|H|")?"fc":"f₀"):view.plot.yLabel.startsWith("P")?"Pmax":copy.characteristic;
  const tau=view.metrics.find(m=>m.label==="τ")?.value;
  const rcMark=tau!==undefined&&view.plot.yLabel.startsWith("uC")?{point:[tau,view.formula.includes("1-e")?12*(1-Math.exp(-1)):12*Math.exp(-1)] as const,label:"τ"}:undefined;
  return <EngineeringPlot plot={view.plot} language={language} compact gridMode={paper?"millimeter":"engineering"} svgClass="micro-plot" legendClass="micro-legend" selected={view.point} characteristic={view.characteristic?{point:view.characteristic,label}:rcMark} cursorTime={view.timeMax!==undefined?view.time:undefined} label={`${copy.plot}: ${view.plot.yLabel} / ${view.plot.xLabel}`} />;
}
