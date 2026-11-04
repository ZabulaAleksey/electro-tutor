import type { CSSProperties } from "react";
import { ResistorGlyph, ReferenceEmfGlyph } from "../engineering/symbols";
import type { Language } from "../types";
import { getLocale } from "../i18n";

export default function CircuitDiagram({ language }: { language: Language }) {
  const copy = getLocale(language).circuit;
  return (
    <div className="circuit-wrap">
      <svg className="circuit" viewBox="0 0 360 340" role="img"
        aria-label={`${copy.aria}. ${copy.description}`}
        style={{ "--ink": "var(--circuit-line)", "--white": "var(--circuit-component)" } as CSSProperties}>
        <defs>
          <marker id="arrow-blue" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="var(--circuit-i1)" />
          </marker>
          <marker id="arrow-orange" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="var(--circuit-i2)" />
          </marker>
          <marker id="arrow-green" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="var(--circuit-i3)" />
          </marker>
        </defs>
        <rect x="8" y="8" width="344" height="324" rx="16" fill="var(--circuit-bg)" stroke="var(--line)" />
        <g className="wire" fill="none" stroke="var(--circuit-line)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M40 156V80H80 M152 80H180 M180 80H208 M280 80H320V156" />
          <path d="M40 216V280H180 M180 280H320V216 M180 80V148 M180 212V280" />
        </g>
        <ResistorGlyph x={80} y={80} terminalSpan={72} />
        <ResistorGlyph x={208} y={80} terminalSpan={72} />
        <ResistorGlyph x={180} y={148} terminalSpan={64} orientation="vertical" />
        <ReferenceEmfGlyph x={40} y={186} />
        <ReferenceEmfGlyph x={320} y={186} />
        <g className="circuit-labels" fill="var(--circuit-line)" fontFamily="system-ui, sans-serif" fontSize="18" fontWeight="600" textAnchor="middle">
          <text x="116" y="57">R₁ = 4 Ω</text>
          <text x="244" y="57">R₂ = 6 Ω</text>
          <text x="139" y="174">R₃</text><text x="139" y="198">2 Ω</text>
          <text x="52" y="310">E₁ = 24 V</text><text x="308" y="310">E₂ = 12 V</text>
          <text x="180" y="31">A</text><text x="180" y="310">B</text>
        </g>
        <g className="source-polarity" fill="var(--circuit-line)" fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle">
          <text x="40" y="176" data-polarity="e1-top-plus">+</text>
          <text x="40" y="208" data-polarity="e1-bottom-minus">−</text>
          <text x="320" y="176" data-polarity="e2-top-minus">−</text>
          <text x="320" y="208" data-polarity="e2-bottom-plus">+</text>
        </g>
        <path d="M78 226 C58 130 123 110 142 146" fill="none" stroke="var(--circuit-i1)" strokeWidth="2.5" markerEnd="url(#arrow-blue)" data-loop-current="I1" />
        <path d="M218 226 C198 130 263 110 282 146" fill="none" stroke="var(--circuit-i2)" strokeWidth="2.5" markerEnd="url(#arrow-orange)" data-loop-current="I2" />
        <path d="M180 224V258" fill="none" stroke="var(--circuit-i3)" strokeWidth="2.5" markerEnd="url(#arrow-green)" data-branch-current="I3" />
        <g fontFamily="system-ui, sans-serif" fontSize="20" fontWeight="700" textAnchor="middle">
          <text x="112" y="256" fill="var(--circuit-i1)">I₁</text>
          <text x="248" y="256" fill="var(--circuit-i2)">I₂</text>
          <text x="203" y="254" fill="var(--circuit-i3)">I₃</text>
        </g>
        <circle cx="180" cy="80" r="4" fill="var(--circuit-line)" />
        <circle cx="180" cy="280" r="4" fill="var(--circuit-line)" />
      </svg>
      <div className="circuit-legend">
        <span><i className="dot blue" /> I₁ — {copy.left}</span>
        <span><i className="dot orange" /> I₂ — {copy.right}</span>
        <span><i className="dot green" /> I₃: A → B</span>
      </div>
    </div>
  );
}
