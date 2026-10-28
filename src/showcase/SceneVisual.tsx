import { useId, useMemo } from "react";
import { ac, dc, diode, line, n, rc, star, type Parameters, type Plot, type SceneKind } from "./physics";
import type { Language } from "../types";
import { showcaseCopy } from "./copy";

const ink = "var(--ink)", paper = "var(--white)";
const color = (tone: string) => `var(--${tone})`;
export function CircuitVisual({ kind, parameters, time = 0, mini = false, language }: { kind: SceneKind; parameters: Parameters; time?: number; mini?: boolean; language: Language }) {
  const id = useId().replace(/:/g, "");
  const arrow = `lab-arrow-${id}`;
  const d = dc(parameters.dc.e, parameters.dc.r1), a = ac(parameters.ac.frequency, parameters.ac.resistance), r = rc(time, parameters.rc.resistance, parameters.rc.capacitance);
  const title = showcaseCopy[language].scheme;
  const markerDistance = (time % 6) / 6 * 1320;
  const marker = markerDistance < 440 ? [70 + markerDistance, 80] : markerDistance < 660 ? [510, 80 + markerDistance - 440] : markerDistance < 1100 ? [510 - (markerDistance - 660), 300] : [70, 300 - (markerDistance - 1100)];
  function resistor(x: number, y: number, label: string, tone = "orange", width = 82) {
    return <g><rect x={x} y={y - 12} width={width} height="24" rx="2" fill={paper} stroke={ink} strokeWidth="2.5" /><text x={x + width / 2} y={y - 28} textAnchor="middle" fill={color(tone)}>{label}</text></g>;
  }
  function source(label: string, alternating = false) {
    return <g><circle cx="70" cy="190" r="28" fill={paper} stroke={ink} strokeWidth="2.5" /><text x="70" y="197" textAnchor="middle" fill={color("blue")} fontSize="24">{alternating ? "∿" : "+"}</text><text x="20" y="236" fill={color("blue")}>{label}</text>{!alternating && <text x="84" y="224" fill={color("blue")}>−</text>}</g>;
  }
  const series = kind === "dc" || kind === "ac" || kind === "diode";
  return <svg className={mini ? "lab-circuit lab-mini-circuit" : "lab-circuit"} viewBox="0 0 580 360" role="img" aria-label={`${title}: ${kind}`}>
    <defs><marker id={arrow} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto-start-reverse"><path d="M0 0 L7 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.5" /></marker><pattern id={`grid-${id}`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="var(--line)" /></pattern></defs>
    <rect width="580" height="360" fill={`url(#grid-${id})`} />
    <g fill="none" stroke={ink} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      {series && <><path d="M70 80 V162 M70 218 V300 H510 V80" />{kind === "dc" && <path d="M70 80 H170 M252 80 H355 M437 80 H510" />}{kind === "ac" && <><path d="M70 80 H128 M210 80 H240 M336 80 H410 M410 80 V61 M410 99 V80 M426 61 V99 M426 80 H510" /><path d="M240 80 a12 18 0 0 1 24 0 a12 18 0 0 1 24 0 a12 18 0 0 1 24 0 a12 18 0 0 1 24 0" stroke={ink} /></>}{kind === "diode" && <><path d="M70 80 H170 M252 80 H376 M420 80 H510" /><path d="M376 60 L411 80 L376 100 Z M413 60 V100" stroke={ink} /></>}</>}
      {kind === "rc" && <><path d="M70 80 V162 M70 218 V300 H480 V199 M480 159 V80 H302 M220 80 H180 M118 80 H70" /><circle cx="118" cy="80" r="3" fill={ink} /><circle cx="180" cy="80" r="3" fill={ink} /><path d="M118 80 H180" stroke={color("green")} /><path d="M454 162 H506 M454 197 H506" stroke={ink} /></>}
      {(kind === "three" || kind === "neutral") && <>{[90, 180, 270].map((y, k) => <g key={y}><path d={`M60 ${y} H220 M302 ${y} H470 V180`} stroke={ink} /><circle cx="60" cy={y} r="4" fill={color(["orange", "blue", "violet"][k])} /><path d={`M104 ${y - 15} H176`} stroke={color(["orange", "blue", "violet"][k])} markerEnd={`url(#${arrow})`} /></g>)}{kind === "three" && <path d="M60 325 H470 V180" stroke={color("green")} />}<circle cx="470" cy="180" r="5" fill={ink} /></>}
      {kind === "line" && <><path d="M55 125 V158 M55 202 V235 H480 V209 M480 151 V125 H155 M55 125 H90" /><circle cx="55" cy="180" r="22" stroke={color("blue")} /><rect x="90" y="113" width="65" height="24" fill={paper} stroke={color("orange")} /><rect x="468" y="151" width="24" height="58" fill={paper} stroke={color("orange")} /><path d="M180 144 H390 M390 214 H285" stroke={color("blue")} markerEnd={`url(#${arrow})`} /><path d="M390 163 H300" stroke={color("violet")} markerEnd={`url(#${arrow})`} /></>}
    </g>
    <g fontFamily="inherit" fontSize="16" fontWeight="600" fill={ink}>
      {kind === "dc" && <>{source(`E = ${n(d.e)} V`)}{resistor(170, 80, `R₁ = ${n(d.r1)} Ω`)}{resistor(355, 80, "R₂ = 40 Ω", "violet")}<circle cx="70" cy="80" r="4" fill={ink} /><circle cx="304" cy="80" r="4" fill={ink} /><circle cx="510" cy="300" r="4" fill={ink} /><text x="78" y="55">A</text><text x="299" y="55">B</text><text x="524" y="306">0</text><text x="235" y="206" fontSize="40" fill={color("orange")}>{n(d.i, 3)} A</text><path d="M170 120 H250" fill="none" stroke={color("orange")} strokeWidth="2.5" markerEnd={`url(#${arrow})`} /><text x="170" y="147" fill={color("orange")}>I →</text><text x="175" y="272" fill={color("blue")}>+ Uᵣ₁ −</text><text x="350" y="272" fill={color("violet")}>+ Uᵣ₂ −</text>{!mini && <circle cx={marker[0]} cy={marker[1]} r="5" fill={color("orange")} />}</>}
      {kind === "ac" && <>{source("U = 230 V RMS", true)}{resistor(128, 80, `R = ${a.resistance} Ω`)}<text x="258" y="43" fill={color("violet")}>L = 0.2 H</text><text x="385" y="43" fill={color("blue")}>C = 100 µF</text><path d="M151 124 H213" stroke={color("orange")} fill="none" markerEnd={`url(#${arrow})`} /><text x="154" y="150" fill={color("orange")}>i(t)</text><text x="206" y="258" fill={color("blue")}>u(t) = √2 U sin(ωt)</text><text x="215" y="333">f = {a.frequency} Hz</text><Phasors kind="ac" parameters={parameters} time={time} /></>}
      {kind === "rc" && <>{source("E = 12 V")}{resistor(220, 80, `R = ${parameters.rc.resistance} Ω`)}<text x="116" y="51" fill={color("green")}>t = 0</text><text x="352" y="155" fill={color("blue")}>+</text><text x="354" y="218" fill={color("blue")}>−</text><text x="363" y="257" fill={color("blue")}>C = {n(parameters.rc.capacitance * 1e6)} µF</text><rect x="455" y={197 - 35 * r.uc / 12} width="50" height={35 * r.uc / 12} fill={color("blue")} opacity=".18" /><text x="210" y="193" fill={color("blue")} fontSize="35">{n(r.uc)} V</text><text x="210" y="225" fill={color("orange")}>i = {n(r.i * 1000)} mA</text><text x="200" y="333">uC(0) = 0 V</text></>}
      {kind === "diode" && <>{source("E = 5 V")}{resistor(170, 80, "R = 1 kΩ")}<text x="373" y="47" fill={color("orange")}>D</text><text x="354" y="127" fill={color("blue")}>+ uD −</text><text x="220" y="199" fill={color("orange")} fontSize="35">{n(diode().i * 1000, 3)} mA</text><text x="204" y="238">uD = {n(diode().ud, 3)} V</text><path d="M275 118 H335" stroke={color("orange")} fill="none" markerEnd={`url(#${arrow})`} /><text x="280" y="144" fill={color("orange")}>iD</text></>}
      {(kind === "three" || kind === "neutral") && <>{[90, 180, 270].map((y, k) => <g key={y}><text x="30" y={y + 5} fill={color(["orange", "blue", "violet"][k])}>{"ABC"[k]}</text>{resistor(220, y, kind === "three" ? "46 Ω" : ["ZA", "ZB", "ZC"][k], ["orange", "blue", "violet"][k])}<text x="110" y={y + 27} fill={color(["orange", "blue", "violet"][k])}>I{"ABC"[k]}</text></g>)}<text x="486" y="186">n</text>{kind === "three" ? <text x="28" y="331" fill={color("green")}>N</text> : <text x="170" y="326">N ≠ n · IN = 0 A</text>}<text x="25" y="27">Uφ = 230 V RMS</text></>}
      {kind === "line" && <><text x="48" y="186" fill={color("blue")}>+</text><text x="15" y="276">E = 100 V</text><text x="88" y="92" fill={color("orange")}>Rs = 50 Ω</text><text x="418" y="279" fill={color("orange")}>RL = 100 Ω</text><text x="200" y="97">Z₀ = 50 Ω · l = 100 km</text><text x="226" y="196" fill={color("blue")}>U⁺ = 50 V →</text><text x="295" y="184" fill={color("violet")}>← U⁻ = {n(line().incident * line().gamma)} V</text><text x="210" y="317">v = 200000 km/s</text></>}
    </g>
    {kind === "magnet" && <g><path d="M140 60 H440 V285 H140 Z M210 117 V228 H370 V117 Z" fill="var(--line)" fillRule="evenodd" stroke={ink} strokeWidth="2" /><rect x="368" y="159" width="74" height="24" fill={paper} /><path d="M176 85 H405 V260 H176 Z" fill="none" stroke={color("blue")} strokeWidth="2.5" strokeDasharray="8 5" /><path d="M262 85 H325" stroke={color("blue")} strokeWidth="2.5" markerEnd={`url(#${arrow})`} />{Array.from({ length: 6 }, (_, k) => <path key={k} d={`M120 ${107 + k * 20} C90 ${97 + k * 20} 90 ${127 + k * 20} 120 ${127 + k * 20} H195`} fill="none" stroke={color("orange")} strokeWidth="3" />)}<g fill={ink} fontSize="17"><text x="52" y="85" fill={color("orange")}>N = 200</text><text x="40" y="281" fill={color("orange")}>I = 0.5 A</text><text x="453" y="178">g</text><text x="239" y="164" fill={color("blue")}>Φ →</text><text x="220" y="201">μr = 1000</text><text x="228" y="325">g = 1 mm</text></g></g>}
  </svg>;
}

export function Phasors({ kind, parameters, time = 0 }: { kind: SceneKind; parameters: Parameters; time?: number }) {
  const isAc = kind === "ac", a = ac(parameters.ac.frequency, parameters.ac.resistance);
  const s = isAc ? null : star(kind === "neutral");
  const values = isAc ? [{ angle: Math.PI * time / 2, length: 45, label: "u / Û", tone: "blue" }, { angle: Math.PI * time / 2 - a.phi, length: 45, label: "i / Î", tone: "orange" }] : Object.values(s!.currents).map((v, k) => ({ angle: Math.atan2(v.im, v.re), length: Math.hypot(v.re, v.im) * 4.5, label: `I${"ABC"[k]}`, tone: ["orange", "blue", "violet"][k] }));
  if (kind === "neutral" && s) {
    const scale = 48 / 230, nx = s.displacement.re * scale, ny = -s.displacement.im * scale;
    return <g transform="translate(280 72)"><circle r="48" fill="none" stroke="var(--line)" /><path d="M-55 0 H55 M0 -55 V55" stroke="var(--line)" fill="none" />{Object.values(s.sources).map((u, k) => <g key={k}><path d={`M0 0 L${u.re * scale} ${-u.im * scale}`} stroke="var(--muted)" strokeDasharray="2 3" fill="none" /><path d={`M${nx} ${ny} L${u.re * scale} ${-u.im * scale}`} fill="none" stroke={color(["orange", "blue", "violet"][k])} strokeWidth="2.5" /><text x={u.re * scale + 3} y={-u.im * scale - 4} fontSize="11" fill={color(["orange", "blue", "violet"][k])}>U{"ABC"[k]}′</text></g>)}<path d={`M0 0 L${nx} ${ny}`} stroke={color("green")} strokeWidth="2" strokeDasharray="5 3" /><circle cx={nx} cy={ny} r="3" fill={color("green")} /><text x={nx + 4} y={ny + 12} fontSize="11" fill={color("green")}>n</text><text x="-12" y="13" fontSize="10" fill="var(--muted)">N</text><text x="-62" y="76" fontSize="11" fill={color("green")}>|Un| = {n(Math.hypot(s.displacement.re, s.displacement.im))} V</text></g>;
  }
  return <g transform={isAc ? "translate(315 183)" : "translate(280 78)"} className="lab-phasors">
    <circle r="48" fill="none" stroke="var(--line)" /><path d="M-55 0 H55 M0 -55 V55" stroke="var(--line)" fill="none" />
    {values.map(v => { const x = Math.cos(v.angle) * v.length, y = -Math.sin(v.angle) * v.length; return <g key={v.label}><path d={`M0 0 L${x} ${y}`} stroke={color(v.tone)} strokeWidth="3" fill="none" /><circle cx={x} cy={y} r="3.5" fill={color(v.tone)} /><text x={x + 5} y={y - 6 + (isAc && v.tone === "orange" ? 18 : 0)} fontSize="12" fill={color(v.tone)}>{v.label}</text></g>; })}
    {!isAc && kind === "neutral" && <text x="-55" y="72" fontSize="12" fill={color("green")}>|Un| = {n(Math.hypot(s!.displacement.re, s!.displacement.im))} V</text>}
  </g>;
}

export function ScenePlot({ plot, kind, parameters, time = 0, language }: { plot: Plot; kind: SceneKind; parameters: Parameters; time?: number; language: Language }) {
  const id = useId().replace(/:/g, ""), clip = `lab-plot-${id}`;
  const polylinePoints = useMemo(() => plot.curves.map(curve => curve.points.map(([px, py]) => `${(53 + px / plot.xMax * 460).toFixed(3)},${(184 - (py - plot.yMin) / (plot.yMax - plot.yMin) * 142).toFixed(3)}`).join(" ")), [plot]);
  const x = (v: number) => 53 + v / plot.xMax * 460, y = (v: number) => 184 - (v - plot.yMin) / (plot.yMax - plot.yMin) * 142;
  const cursor = kind === "rc" ? Math.min(time, plot.xMax) : kind === "ac" ? (time / 4 % 2) / 2 * plot.xMax : null;
  const d = diode();
  return <svg className="lab-plot" viewBox="0 0 550 235" role="img" aria-label={`${showcaseCopy[language].graphs}: ${kind}`}>
    <defs><clipPath id={clip}><rect x="52" y="40" width="463" height="146" /></clipPath></defs>
    {[0, 1, 2, 3, 4].map(k => <g key={k} fill="var(--muted)" fontSize="12"><path d={`M53 ${42 + k * 35.5} H513 M${53 + k * 115} 42 V184`} stroke="var(--line)" strokeWidth="1" /><text x="46" y={46 + k * 35.5} textAnchor="end">{n(plot.yMax - k * (plot.yMax - plot.yMin) / 4)}</text><text x={53 + k * 115} y="204" textAnchor="middle">{n(k * plot.xMax / 4)}</text></g>)}
    <path d="M53 40 V184 H516" fill="none" stroke="var(--muted)" strokeWidth="1.3" /><text x="53" y="22" fill="var(--muted)" fontSize="12">{plot.yLabel}</text><text x="514" y="227" textAnchor="end" fill="var(--muted)" fontSize="12">{plot.xLabel}</text>
    <g clipPath={`url(#${clip})`}>
      {plot.curves.map((curve, index) => <polyline key={curve.label} points={polylinePoints[index]} fill="none" stroke={color(curve.color)} strokeWidth="2.8" strokeDasharray={curve.dash ? index === 2 ? "2 4" : "8 5" : undefined} />)}
      {cursor !== null && <path d={`M${x(cursor)} 40 V186`} stroke={color("green")} strokeWidth="1.5" strokeDasharray="3 4" />}
      {kind === "diode" && <><circle cx={x(d.ud)} cy={y(d.i * 1000)} r="6" fill={color("green")} /><text x={x(d.ud) - 13} y={y(d.i * 1000) - 13} fill={color("green")} fontSize="14">Q</text></>}
      {kind === "ac" && <circle cx={x(cursor ?? 0)} cy={y(Math.sin(Math.PI * time / 2))} r="4.5" fill={color("blue")} />}
      {kind === "rc" && <circle cx={x(cursor ?? 0)} cy={y(rc(time, parameters.rc.resistance, parameters.rc.capacitance).uc / 12)} r="4.5" fill={color("blue")} />}
    </g>
  </svg>;
}
