import { useId } from "react";
import type { Language } from "../types";
import { formatNumber } from "../i18n";
import type { MicroLab } from "./micro-catalog";
import { microCopy } from "./micro-catalog";
import type { MicroModel } from "./micro-models";
import { n } from "./physics";

/** Neutral schematic symbols; colour reserved for selected measurements. */
export function CircuitView({ lab, a, b, language }: { lab: MicroLab; a: number; b: number; language: Language }) {
  const kind = lab.model, id = useId().replace(/:/g, ""), arrow = `micro-arrow-${id}`;
  const capacitor = kind === "charge" || kind === "discharge" || kind === "filter";
  const source = kind === "ohm" ? `U = ${n(a)} V` : kind === "diode" ? `E = ${n(a)} V` : kind === "drive" ? `U = ${n(a)} V` : capacitor ? kind === "filter" ? "U = 1 V RMS" : "E = 12 V" : "E = 24 V";
  function resistor(x: number, label: string, width = 58) { return <g><rect x={x} y="22" width={width} height="18" fill="var(--white)" /><text x={x + width / 2} y="15" textAnchor="middle">{label}</text></g>; }
  const parallel = kind === "parallel", three = kind === "star", special = parallel || three || kind === "rms" || kind === "control" || kind === "reflection";
  return <svg viewBox="0 0 380 145" className="micro-circuit" role="img" aria-label={`${microCopy[language].scheme}: ${lab.title[language]}`}>
    <defs><marker id={arrow} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.2" /></marker></defs>
    <g stroke="var(--ink)" strokeWidth="1.7" fill="none" strokeLinejoin="round">
      {!special && <>
        <path d={`M36 31 H${kind === "resonance" ? 95 : 115} M${kind === "resonance" ? 145 : 173} 31 H${kind === "resonance" ? 180 : kind === "divider" || kind === "power" || kind === "diode" ? 235 : 314}`} />
        {kind === "divider" || kind === "power" ? <><path d="M293 31 H314 V115 H36 V95 M36 51 V31" />{resistor(115, kind === "power" ? `r = ${n(a)} Ω` : `R₁ = ${n(a)} Ω`)}{resistor(235, kind === "power" ? `Rᴸ = ${n(b)} Ω` : `R₂ = ${n(b)} Ω`)}<circle cx="204" cy="31" r="3" fill="var(--ink)" />{kind === "divider" && <text x="237" y="59">+ U₂ −</text>}</> : kind === "resonance" ? <><path d="M180 31 a9 13 0 0 1 18 0 a9 13 0 0 1 18 0 a9 13 0 0 1 18 0 M234 31 H271 M271 18 V44 M283 18 V44 M283 31 H314 V115 H36 V95 M36 51 V31" />{resistor(95, `R = ${n(b)} Ω`, 50)}<text x="202" y="15" textAnchor="middle">0.2 H</text><text x="279" y="15" textAnchor="middle">100 µF</text></> : kind === "diode" ? <><path d="M235 18 L256 31 L235 44 Z M258 18 V44 M258 31 H314 V115 H36 V95 M36 51 V31" />{resistor(115, `R = ${n(b)} Ω`)}<text x="277" y="60">D</text><text x="237" y="100">+ uD −</text></> : capacitor ? <><path d="M314 31 V62 M296 62 H332 M296 82 H332 M314 82 V115 H36" />{kind === "discharge" ? <path d="M36 115 V31" /> : <path d="M36 115 V95 M36 51 V31" />}{resistor(115, kind === "filter" ? "R = 1 kΩ" : `R = ${n(a)} Ω`)}<text x="333" y="72">+</text><text x="333" y="96">−</text><text x="220" y="135">C = {n(b)} µF</text><circle cx="314" cy="50" r="3" fill="var(--green)" stroke="var(--green)" /><text x="232" y="78" fill="var(--blue)" stroke="none">uC</text></> : kind === "drive" ? <><path d="M314 31 V51 M314 95 V115 H36 V95 M36 51 V31" />{resistor(115, "Ra = 1 Ω")}<circle cx="314" cy="73" r="22" /><text x="314" y="78" textAnchor="middle">M</text><path d="M337 73 H365" markerEnd={`url(#${arrow})`} /><text x="272" y="135">Mᴸ = {n(b)} N·m</text></> : <><path d="M314 31 V115 H36 V95 M36 51 V31" />{resistor(115, `R = ${n(b)} Ω`)}</>}
        {kind !== "discharge" && <><circle cx="36" cy="73" r="22" fill="var(--white)" /><text x="36" y={kind === "resonance" || kind === "filter" ? 78 : 68} textAnchor="middle">{kind === "resonance" || kind === "filter" ? "∿" : "+"}</text>{kind !== "resonance" && kind !== "filter" && <text x="36" y="86" textAnchor="middle">−</text>}<text x="4" y="137">{kind === "resonance" ? "230 V RMS" : source}</text></>}
        <path d={kind === "discharge" ? "M201 73 H139" : "M145 73 H207"} stroke="var(--blue)" markerEnd={`url(#${arrow})`} /><text x="173" y="97" textAnchor="middle" stroke="none" fill="var(--blue)">{kind === "discharge" ? "iR ←" : "iR →"}</text>
      </>}
      {parallel && <><path d="M36 25 H315 V115 H36 V95 M36 51 V25 M164 25 V54 M164 84 V115" /><circle cx="36" cy="73" r="22" /><path d="M36 87 V60" markerEnd={`url(#${arrow})`} /><rect x="153" y="54" width="22" height="30" fill="var(--white)" /><rect x="304" y="54" width="22" height="30" fill="var(--white)" />{[164, 315].map(x => <g key={x}><circle cx={x} cy="25" r="3" fill="var(--ink)" /><circle cx={x} cy="115" r="3" fill="var(--ink)" /></g>)}<text x="4" y="137">Is = 1 A</text><text x="130" y="46">R₁ = {n(a)} Ω</text><text x="270" y="46">R₂ = {n(b)} Ω</text><text x="180" y="103">I₁ ↓</text><text x="330" y="103">I₂ ↓</text></>}
      {three && <>{[28, 66, 104].map((y, k) => <g key={y}><path d={`M46 ${y} H162 M220 ${y} H309 V66`} /><rect x="162" y={y - 7} width="58" height="14" fill="var(--white)" /><text x="27" y={y + 5}>{"ABC"[k]}</text><text x="125" y={y - 10}>I{"ABC"[k]} →</text></g>)}<path d="M46 130 H309 V66" /><circle cx="309" cy="66" r="3" fill="var(--ink)" /><text x="27" y="135">N</text><text x="328" y="70">n</text><text x="75" y="141">Uφ = {n(a)} V · Rφ = {n(b)} Ω</text></>}
      {kind === "rms" && <><path d="M40 75 H335 M65 25 V123" stroke="var(--muted)" /><path d={`M65 75 Q93 ${75 - a} 121 75 T177 75 T233 75 T289 75`} stroke="var(--blue)" strokeWidth="2.3" /><text x="65" y="18">Û = {n(a)} V</text><text x="230" y="135">f = {n(b)} Hz</text><text x="339" y="79">t</text></>}
      {kind === "control" && <><path d="M20 95 H45 V55 H105 M105 75 H139 M285 75 H355" markerEnd={`url(#${arrow})`} /><rect x="139" y="40" width="146" height="70" rx="2" /><text x="212" y="69" textAnchor="middle">K = {n(a)}</text><text x="212" y="92" textAnchor="middle">τ = {n(b)} s</text><text x="20" y="32">u = 1(t)</text><text x="324" y="53">y(t)</text></>}
      {kind === "reflection" && <><path d="M30 38 H90 M140 38 H307 V59 M307 90 V115 H30 V96 M30 52 V38" /><circle cx="30" cy="74" r="22" /><rect x="90" y="29" width="50" height="18" fill="var(--white)" /><rect x="297" y="59" width="20" height="31" fill="var(--white)" /><text x="30" y="79" textAnchor="middle">+</text><text x="94" y="18">Rs = Z₀</text><text x="225" y="18">Rᴸ = {n(a)} Ω</text><path d="M171 50 H263" stroke="var(--blue)" markerEnd={`url(#${arrow})`} /><path d="M263 101 H171" stroke="var(--orange)" strokeDasharray="5 3" markerEnd={`url(#${arrow})`} /><text x="174" y="82">Z₀ = {n(b)} Ω</text><text x="22" y="139">E = 100 V</text><text x="200" y="139">l = 100 km</text></>}
    </g>
  </svg>;
}

export function LivePlot({ view, language }: { view: MicroModel; language: Language }) {
  const id = useId().replace(/:/g, ""), p = view.plot, copy = microCopy[language];
  const x = (v: number) => Number((54 + v / p.xMax * 346).toFixed(3)), y = (v: number) => Number((164 - (v - p.yMin) / (p.yMax - p.yMin) * 126).toFixed(3));
  const coords = (point: readonly [number, number]) => `${formatNumber(language, point[0], 3)}; ${formatNumber(language, point[1], 3)}`;
  return <div className="micro-plot-wrap"><svg className="micro-plot" viewBox="0 0 440 205" role="img" aria-label={`${copy.plot}: ${p.yLabel} / ${p.xLabel}`}>
    <defs><clipPath id={`micro-clip-${id}`}><rect x="52" y="36" width="351" height="130" /></clipPath></defs>
    {Array.from({ length: 9 }, (_, k) => <path key={k} d={`M54 ${38 + k * 15.75} H400 M${54 + k * 43.25} 38 V164`} stroke="var(--line)" opacity={k % 2 ? 0.45 : 1} strokeWidth={k % 2 ? 0.6 : 1} />)}
    {[0, 1, 2, 3, 4].map(k => <g key={k} fill="var(--muted)" fontSize="12"><text x="47" y={42 + k * 31.5} textAnchor="end">{formatNumber(language, p.yMax - k * (p.yMax - p.yMin) / 4, 2)}</text><text x={54 + k * 86.5} y="182" textAnchor="middle">{formatNumber(language, k * p.xMax / 4, 2)}</text></g>)}
    <path d="M54 36 V164 H403" stroke="var(--muted)" fill="none" /><text x="54" y="21" fill="var(--ink)" fontSize="13">{p.yLabel}</text><text x="402" y="201" textAnchor="end" fill="var(--ink)" fontSize="13">{p.xLabel}</text>
    <g clipPath={`url(#micro-clip-${id})`}>
      {p.yMin < 0 && <path d={`M54 ${y(0)} H400`} stroke="var(--muted)" strokeDasharray="2 3" />}
      {p.curves.map((c, k) => <polyline key={c.label} fill="none" stroke={`var(--${c.color})`} strokeWidth="2.4" strokeDasharray={c.dash ? k === 2 ? "2 4" : "7 4" : undefined} points={c.points.map(([px, py]) => `${x(px)},${y(py)}`).join(" ")} />)}
      {view.timeMax !== undefined && <path d={`M${x(view.time)} 37 V164`} stroke="var(--green)" strokeDasharray="3 3" />}
      {view.characteristic && <rect x={x(view.characteristic[0]) - 3.5} y={y(view.characteristic[1]) - 3.5} width="7" height="7" fill="var(--white)" stroke="var(--ink)"><title>{`${copy.characteristic}: ${coords(view.characteristic)}`}</title></rect>}
      <circle cx={x(view.point[0])} cy={y(view.point[1])} r="4.5" fill="var(--green)" stroke="var(--white)" strokeWidth="1.5"><title>{`${copy.selected}: ${coords(view.point)}`}</title></circle>
    </g>
  </svg><div className="micro-legend">{p.curves.map((c, k) => <span key={c.label}><i style={{ color: `var(--${c.color})`, borderTopStyle: c.dash ? k === 2 ? "dotted" : "dashed" : "solid" }} />{c.label}</span>)}<span>● {copy.selected}</span>{view.characteristic && <span>□ {copy.characteristic}</span>}</div></div>;
}
