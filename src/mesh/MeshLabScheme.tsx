import type { CSSProperties } from "react";
import { ResistorGlyph, ReferenceEmfGlyph, SourceGlyph } from "../engineering/symbols";
import type { MeshParameters } from "../models/mesh-current";
import { copy } from "./ru";
export default function MeshLabScheme({ p, active, loop }: { p: MeshParameters; active: string; loop: number }) {
  const triple = p.example === 3, sup = p.example === 4, prefix = "mesh-lab", color = (k: number) => k === 1 ? "var(--circuit-i1)" : k === 2 ? "var(--circuit-i2)" : "var(--mesh-third)";
  const wire = (x: number, y: number, a: number, b: number, key: string) => <path key={key} data-wire-from={`${x},${y}`} data-wire-to={`${a},${b}`} d={`M${x} ${y}L${a} ${b}`} stroke="var(--circuit-line)" strokeWidth="2.5" fill="none" />;
  const signs = (x: number, y: number, value: number) => <g className="source-polarity" fontSize="20" textAnchor="middle" fontWeight="700"><text x={x} y={y - 7}>{!Number.isFinite(value) ? "?" : value < 0 ? "−" : "+"}</text><text x={x} y={y + 20}>{!Number.isFinite(value) ? "?" : value < 0 ? "+" : "−"}</text></g>;
  const element = (key: string) => ({ "data-element": key, className: active === key ? "mesh-active-element" : undefined });
  const branchArrow = (x: number, y: number, up: boolean, n: number, tx: number) => <g><path data-branch-current={n} d={`M${x} ${y}v${up ? -23 : 23}`} stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd={`url(#${prefix}-branch)`} /><text x={tx} y={up ? y - 8 : y + 17} fill="var(--circuit-i3)">{`i${["₁", "₂", "₃", "₄"][n - 1]}`}</text></g>;
  return <figure className="circuit-wrap mesh-lab-figure"><svg className="circuit mesh-lab-scheme" viewBox="0 0 360 300" role="img" aria-label={`${copy.diagram} ${copy.presets[p.example - 1]}`} style={{ "--ink": "var(--circuit-line)", "--white": "var(--circuit-component)" } as CSSProperties}>
    <defs>{[1, 2, 3].map(k => <marker key={k} id={`${prefix}-loop${k}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill={color(k)} /></marker>)}<marker id={`${prefix}-branch`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="var(--circuit-i3)" /></marker></defs>
    <rect x="5" y="5" width="350" height="290" rx="12" fill="var(--circuit-bg)" stroke="var(--line)" />
    <g fontFamily="system-ui, sans-serif" fontSize="18" fontWeight="600" fill="var(--circuit-line)">
    {triple ? <>
      {[40, 133, 180, 227].map((x, k) => wire(x, 65, [133, 180, 227, 320][k], 65, `t${k}`))}{[40, 133, 180, 227].map((x, k) => wire(x, 260, [133, 180, 227, 320][k], 260, `b${k}`))}
      {[40, 133, 227, 320].map((x, k) => <g key={x}>{wire(x, 65, x, 85, `v${k}`)}<g {...element(`R${k + 1}`)}><ResistorGlyph x={x} y={85} terminalSpan={50} orientation="vertical" /></g><text x={x} y="49" textAnchor="middle">{`R${["₁", "₂", "₃", "₄"][k]}`}</text>{k === 0 || k === 3 ? <>{wire(x, 135, x, 140, `s${k}`)}<g {...element(k === 0 ? "E1" : "E2")}><ReferenceEmfGlyph x={x} y={170} />{signs(x, 170, k === 0 ? p.emf[0] : -p.emf[1])}</g>{wire(x, 200, x, 260, `e${k}`)}<text x={x} y="219" textAnchor="middle">{k === 0 ? "E₁" : "E₂"}</text>{branchArrow(x, k === 0 ? 251 : 229, k === 0, k + 1, k === 0 ? 59 : 295)}</> : <>{wire(x, 135, x, 260, `c${k}`)}{branchArrow(x, 211, false, k + 1, x + 13)}</>}</g>)}
      {[0, 93, 187].map((offset, k) => <g key={k}><path data-mesh-current={k + 1} className={loop === k + 1 ? "mesh-selected-loop" : undefined} d={`M${80 + offset} 214C${65 + offset} 170 ${99 + offset} 123 ${112 + offset} 147`} stroke={color(k + 1)} strokeWidth={loop === k + 1 ? 4 : 2.5} fill="none" markerEnd={`url(#${prefix}-loop${k + 1})`} /><text x={84 + offset} y="251" fill={color(k + 1)} textAnchor="middle">{`I${["₁", "₂", "₃"][k]}`}</text></g>)}
    </> : <>
      {[[40, 60, 60, 60], [132, 60, 180, 60], [180, 60, 208, 60], [280, 60, 320, 60], [40, 60, 40, 140], [40, 200, 40, 240], [40, 240, 180, 240], [180, 240, 320, 240]].map(([x, y, a, b], k) => wire(x, y, a, b, String(k)))}
      <g {...element("R1")}><ResistorGlyph x={60} y={60} terminalSpan={72} /></g><g {...element("R2")}><ResistorGlyph x={208} y={60} terminalSpan={72} /></g>
      <g {...element("E1")}><ReferenceEmfGlyph x={40} y={170} />{signs(40, 170, p.emf[0])}</g>
      {p.example === 2 ? <>{wire(320, 60, 320, 140, "r0")}<g {...element("E2")}><ReferenceEmfGlyph x={320} y={170} />{signs(320, 170, p.emf[1])}</g>{wire(320, 200, 320, 240, "r1")}</> : wire(320, 60, 320, 240, "right")}
      {sup ? <>{wire(180, 60, 180, 128, "j0")}<g {...element("J")} transform={p.current >= 0 ? "rotate(180 180 150)" : undefined} data-current-direction={!Number.isFinite(p.current) ? "unknown" : p.current < 0 ? "B-to-A" : "A-to-B"}>{Number.isFinite(p.current) ? <SourceGlyph x={180} y={150} current /> : <><circle cx="180" cy="150" r="22" fill="none" stroke="var(--circuit-line)" /><text x="180" y="157" textAnchor="middle">?</text></>}</g>{wire(180, 172, 180, 240, "j1")}<text x="150" y="118">+</text><text x="150" y="190">−</text><text x="142" y="156" textAnchor="middle">J</text><path data-supermesh="outer" d="M9 219V43H351V250H9V239" stroke="var(--mesh-third)" strokeWidth="2" strokeDasharray="5 4" fill="none" /></> : <>{wire(180, 60, 180, 110, "c0")}<g {...element("R3")}><ResistorGlyph x={180} y={110} terminalSpan={64} orientation="vertical" /></g>{wire(180, 174, 180, 240, "c1")}<text x="145" y="148" textAnchor="middle">R₃</text></>}
      {[0, 140].map((offset, k) => <g key={k}><path data-mesh-current={k + 1} className={loop === k + 1 ? "mesh-selected-loop" : undefined} d={`M${79 + offset} 205C${60 + offset} 126 ${121 + offset} 99 ${143 + offset} 124`} fill="none" stroke={color(k + 1)} strokeWidth={loop === k + 1 ? 4 : 2.5} markerEnd={`url(#${prefix}-loop${k + 1})`} /><text x={107 + offset} y="225" fill={color(k + 1)} textAnchor="middle">{k === 0 ? "I₁" : "I₂"}</text></g>)}
      {branchArrow(40, 234, true, 1, 59)}{branchArrow(180, 192, false, 2, 200)}{branchArrow(320, 207, false, 3, 294)}
      <text x="96" y="35" textAnchor="middle">R₁</text><text x="244" y="35" textAnchor="middle">R₂</text><text x="40" y="278" textAnchor="middle">E₁</text>{p.example === 2 && <text x="320" y="278" textAnchor="middle">E₂</text>}
    </>}
    <text x="180" y="25" textAnchor="middle">A</text><text x="180" y="282" textAnchor="middle">B</text>
    <circle cx="180" cy={triple ? 65 : 60} r="3.5" /><circle cx="180" cy={triple ? 260 : 240} r="3.5" />
    </g>
  </svg></figure>;
}
