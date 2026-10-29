import type {CSSProperties} from "react";
import {ResistorGlyph,ReferenceEmfGlyph} from "../engineering/symbols";
import type { Language } from "../types";
import { getLocale } from "../i18n";

export default function CircuitDiagram({ language }: { language: Language }) {
  const copy = getLocale(language).circuit;
  return (
    <div className="circuit-wrap">
      <svg
        className="circuit"
        style={{"--ink":"#27302d","--white":"white"} as CSSProperties}
        viewBox="0 0 760 320"
        role="img"
        aria-label={copy.aria}
      >
        <defs>
          <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#236bfe" />
          </marker>
          <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#e66820" />
          </marker>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".08" />
          </filter>
        </defs>
        <rect x="26" y="24" width="708" height="270" rx="22" fill="#fbfaf7" stroke="#dedbd3" />
        <g className="wire" fill="none" stroke="#27302d" strokeWidth="3" strokeLinecap="round">
          <path d="M105 134V85H180 M272 85H350 M350 85H436 M528 85H650V134"/>
          <path d="M105 194V240H350 M350 240H650V194 M350 85V127 M350 193V240"/>
        </g>
        <g filter="url(#shadow)">
          <ResistorGlyph x={180} y={85} scale={2} terminalSpan={46}/>
          <ResistorGlyph x={436} y={85} scale={2} terminalSpan={46}/>
          <ResistorGlyph x={350} y={127} scale={1.5} terminalSpan={44} orientation="vertical"/>
        </g>
        <g fill="#27302d" fontFamily="Inter, sans-serif" fontSize="17" fontWeight="650">
          <text x="226" y="58" textAnchor="middle">R₁ = 4 Ω</text>
          <text x="482" y="58" textAnchor="middle">R₂ = 6 Ω</text>
          <text x="379" y="165">R₃ = 2 Ω</text>
        </g>
        <g fill="white" stroke="#27302d" strokeWidth="2.5">
          <ReferenceEmfGlyph x={105} y={164}/>
          <ReferenceEmfGlyph x={650} y={164}/>
        </g>
        <g fill="#27302d" fontFamily="Inter, sans-serif" fontWeight="700" textAnchor="middle">
          <text x="105" y="158" fontSize="14">E₁</text>
          <text x="105" y="178" fontSize="13">24 V</text>
          <text x="650" y="158" fontSize="14">E₂</text>
          <text x="650" y="178" fontSize="13">12 V</text>
        </g>
        <path d="M158 178 C173 127 231 122 250 168" fill="none" stroke="#236bfe" strokeWidth="3" markerEnd="url(#arrow-blue)" />
        <path d="M450 178 C467 127 526 122 545 168" fill="none" stroke="#e66820" strokeWidth="3" markerEnd="url(#arrow-orange)" />
        <g fontFamily="Inter, sans-serif" fontSize="18" fontWeight="750">
          <text x="199" y="142" fill="#236bfe">I₁</text>
          <text x="492" y="142" fill="#e66820">I₂</text>
        </g>
        <circle cx="350" cy="85" r="5" fill="#27302d" />
        <circle cx="350" cy="240" r="5" fill="#27302d" />
      </svg>
      <div className="circuit-legend">
        <span><i className="dot blue" /> I₁ — {copy.left}</span>
        <span><i className="dot orange" /> I₂ — {copy.right}</span>
      </div>
    </div>
  );
}
