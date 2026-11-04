import type { CSSProperties } from "react";
import { ResistorGlyph, ReferenceEmfGlyph, SourceGlyph } from "../engineering/symbols";

type Point = readonly [number, number];
function Wire({ from, to }: { from: Point; to: Point }) {
  return <path data-wire-from={from.join(",")} data-wire-to={to.join(",")}
    d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`} fill="none" stroke="var(--circuit-line)" strokeWidth="2.5" />;
}
export default function MeshExampleDiagram({ example }: { example: 1 | 2 | 3 | 4 }) {
  const triple = example === 3;
  const sourceRight = example === 2;
  const current = example === 4;
  const id = `mesh-ex${example}`;
  const descriptions = {
    1: "Два контура, I₁ и I₂ по часовой стрелке. E₁=12В, плюс сверху. R₁=2Ом,R₂=4Ом,R₃=2Ом. i₁=I₁ вверх, i₂=I₁−I₂ отAкB, i₃=I₂ вниз.",
    2: "Два контура по часовой стрелке. E₁=12В,E₂=24В, оба плюс сверху. R₁=2Ом,R₂=4Ом,R₃=2Ом. i₁ вверх, i₂ отAкB, i₃ вниз; отрицательный i₃ означает обратное направление.",
    3: "Четыре ветви междуAиB, три контура I₁,I₂,I₃ по часовой стрелке. R₁=2Ом,R₂=4Ом,R₃=6Ом,R₄=2Ом. E₁=24В плюс сверху,E₂=6В плюс снизу. i₁ вверх, i₂,i₃,i₄ вниз.",
    4: "Два контура по часовой стрелке. E₁=12В плюс сверху,R₁=2Ом,R₂=4Ом. Идеальный источникJ=1А направлен отAкB. I₁−I₂=J. Пунктир — суперконтур; плюс UJ уA, минус уB.",
  };
  const arrow = (key: string) => `url(#${id}-${key})`;
  const polarity = (x: number, y: number, reversed = false) => <g className="source-polarity" fontFamily="system-ui, sans-serif" fontSize={triple ? 18 : 22} fontWeight="700" textAnchor="middle">
    <text x={x} y={y - (triple ? 7 : 10)}>{reversed ? "−" : "+"}</text>
    <text x={x} y={y + (triple ? 21 : 22)}>{reversed ? "+" : "−"}</text>
  </g>;
  return <figure className="circuit-wrap mesh-example-figure" data-example-scheme={example}>
    <svg className="circuit mesh-example-scheme" viewBox={`0 0 360 ${triple ? 430 : 340}`} role="img"
      aria-label={`Схема примера ${example}. ${descriptions[example]}`}
      style={{ "--ink": "var(--circuit-line)", "--white": "var(--circuit-component)" } as CSSProperties}>
      <defs>{[["i1", "var(--circuit-i1)"], ["i2", "var(--circuit-i2)"], ["branch", "var(--circuit-i3)"], ["super", "var(--example-super)"]].map(([key, color]) =>
        <marker key={key} id={`${id}-${key}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill={color} /></marker>)}</defs>
      <rect x="8" y="8" width="344" height={triple ? 414 : 324} rx="16" fill="var(--circuit-bg)" stroke="var(--line)" />
      {triple ? <>
        {[40, 133, 180, 227].map((x, k) => <Wire key={`top${x}`} from={[x, 100]} to={[[133, 180, 227, 320][k], 100]} />)}
        {[40, 133, 180, 227].map((x, k) => <Wire key={`bottom${x}`} from={[x, 335]} to={[[133, 180, 227, 320][k], 335]} />)}
        {[40, 133, 227, 320].map((x, k) => <g key={x}>
          <Wire from={[x, 100]} to={[x, 125]} /><ResistorGlyph x={x} y={125} terminalSpan={50} orientation="vertical" />
          {k === 0 || k === 3 ? <><Wire from={[x, 175]} to={[x, 195]} /><ReferenceEmfGlyph x={x} y={225} />{polarity(x, 225, k === 3)}<Wire from={[x, 255]} to={[x, 335]} /></> : <Wire from={[x, 175]} to={[x, 335]} />}
        </g>)}
        {[0, 93, 187].map((offset, k) => <path key={offset} data-mesh-current={k + 1} d={`M${82 + offset} 284C${66 + offset} 226 ${100 + offset} 160 ${111 + offset} 185`} stroke={k === 0 ? "var(--circuit-i1)" : k === 1 ? "var(--circuit-i2)" : "var(--example-super)"} strokeWidth="2.5" fill="none" markerEnd={arrow(k === 0 ? "i1" : k === 1 ? "i2" : "super")} />)}
        {[40, 133, 227, 320].map((x, k) => <path key={x} data-branch-current={k + 1} d={k === 0 ? `M${x} 312V286` : `M${x} 286V312`} stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd={arrow("branch")} />)}
        <g fill="var(--circuit-line)" fontFamily="system-ui, sans-serif" fontSize="18" fontWeight="600" textAnchor="middle">
          {[40, 133, 227, 320].map((x, k) => <g key={x}><text x={x} y="51">{["R₁", "R₂", "R₃", "R₄"][k]}</text><text x={x} y="76">{["2 Ω", "4 Ω", "6 Ω", "2 Ω"][k]}</text></g>)}
          <text x="180" y="28">A</text><text x="180" y="410">B</text><text x="40" y="280">E₁</text><text x="320" y="280">E₂</text>
          <text x="65" y="410">E₁ = 24 V</text><text x="295" y="410">E₂ = 6 V</text>
          {[62, 155, 249, 298].map((x, k) => <text key={x} x={x} y="315" fill="var(--circuit-i3)">{["i₁", "i₂", "i₃", "i₄"][k]}</text>)}
          <text x="85" y="370" fill="var(--circuit-i1)">I₁</text><text x="180" y="370" fill="var(--circuit-i2)">I₂</text><text x="275" y="370" fill="var(--example-super)">I₃</text>
        </g>
        <circle cx="180" cy="100" r="4" fill="var(--circuit-line)" /><circle cx="180" cy="335" r="4" fill="var(--circuit-line)" />
      </> : <>
        {([[[40, 80], [80, 80]], [[152, 80], [180, 80]], [[180, 80], [208, 80]], [[280, 80], [320, 80]], [[40, 80], [40, 156]], [[40, 216], [40, 280]], [[40, 280], [180, 280]], [[180, 280], [320, 280]]] as const).map(([from, to], k) => <Wire key={k} from={from} to={to} />)}
        <ResistorGlyph x={80} y={80} terminalSpan={72} /><ResistorGlyph x={208} y={80} terminalSpan={72} />
        <ReferenceEmfGlyph x={40} y={186} />{polarity(40, 186)}
        {sourceRight ? <><Wire from={[320, 80]} to={[320, 156]} /><ReferenceEmfGlyph x={320} y={186} />{polarity(320, 186)}<Wire from={[320, 216]} to={[320, 280]} /></> : <Wire from={[320, 80]} to={[320, 280]} />}
        {current ? <><Wire from={[180, 80]} to={[180, 158]} /><g transform="rotate(180 180 180)" data-current-direction="A-to-B"><SourceGlyph x={180} y={180} current /></g><Wire from={[180, 202]} to={[180, 280]} /></> : <><Wire from={[180, 80]} to={[180, 148]} /><ResistorGlyph x={180} y={148} terminalSpan={64} orientation="vertical" /><Wire from={[180, 212]} to={[180, 280]} /></>}
        <path d="M78 226C58 130 123 110 142 146" data-mesh-current="1" fill="none" stroke="var(--circuit-i1)" strokeWidth="2.5" markerEnd={arrow("i1")} />
        <path d="M218 226C198 130 263 110 282 146" data-mesh-current="2" fill="none" stroke="var(--circuit-i2)" strokeWidth="2.5" markerEnd={arrow("i2")} />
        <path d="M40 264V238" data-branch-current="1" stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd={arrow("branch")} />
        <path d="M180 224V258" data-branch-current="2" stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd={arrow("branch")} />
        <path d="M320 238V264" data-branch-current="3" stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd={arrow("branch")} />
        {current && <path d="M6 250V62H356V286H6V274" data-supermesh="outer" fill="none" stroke="var(--example-super)" strokeWidth="2" strokeDasharray="6 5" markerEnd={arrow("super")} />}
        <g fill="var(--circuit-line)" fontFamily="system-ui, sans-serif" fontSize="18" fontWeight="600" textAnchor="middle">
          <text x="116" y="57">R₁ = 2 Ω</text><text x="244" y="57">R₂ = 4 Ω</text>
          <text x="139" y="174">{current ? "J" : "R₃"}</text><text x="139" y="198">{current ? "1 A" : "2 Ω"}</text>
          <text x="52" y="310">E₁ = 12 V</text><text x="308" y="310">{sourceRight ? "E₂ = 24 V" : "Провод"}</text>
          <text x="180" y="31">A</text><text x="180" y="310">B</text>
          <text x="112" y="256" fill="var(--circuit-i1)">I₁</text><text x="248" y="256" fill="var(--circuit-i2)">I₂</text>
          <text x="61" y="264" fill="var(--circuit-i3)">i₁</text><text x="203" y="254" fill="var(--circuit-i3)">i₂</text><text x="300" y="264" fill="var(--circuit-i3)">i₃</text>
          {current && <><text x="154" y="146">+</text><text x="154" y="226">−</text></>}
        </g>
        <circle cx="180" cy="80" r="4" fill="var(--circuit-line)" /><circle cx="180" cy="280" r="4" fill="var(--circuit-line)" />
      </>}
    </svg>
    <figcaption>Схема {example}. Заглавные I — контурные токи, строчные i — токи ветвей.{current && " Пунктир — суперконтур; +/− у общей ветви задают отсчёт Uⱼ от A к B."}</figcaption>
  </figure>;
}
