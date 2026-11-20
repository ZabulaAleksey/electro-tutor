import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import type { CircuitGlyph } from "../circuit/editor-mode";

// Shapes from the pre-migration NetworkWorkbench, fitted to the shared editor's terminals.
export const transientCircuitGlyph: CircuitGlyph = ({ kind, span, closed, reversed, ground, negativeSource }) => {
  switch (kind) {
    case "line":
      return <svg className="network-transmission-stroke" x={-span / 2} y="-2.5" width={span} height="5" overflow="visible">
        <rect width={span} height="5" fill="transparent" stroke="none" />
        <path d={`M0 2.5H${span}`} fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
      </svg>;
    case "r":
      return <g stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <path d="M-29 0H-23M23 0H29" />
        <ResistorGlyph x={-23} y={0} scale={0.8} terminalSpan={57.5} />
      </g>;
    case "l":
      return <g stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <path d="M-27 0H-23M23 0H27" />
        <InductorGlyph x={-23} y={0} scale={46 / 54} />
      </g>;
    case "c":
      return <CapacitorGlyph x={0} y={0} orientation="horizontal" scale={0.7} terminalSpan={54 / 0.7} />;
    case "diode":
      return <g transform={reversed ? "scale(-1 1)" : undefined}><DiodeGlyph x={-11.5} y={0} /></g>;
    case "switch":
      return <g stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <path d={closed ? "M-24 0H24" : "M-24 0H-13M13 0H24M-13 0L8 -9"} />
        <circle cx="-13" r="2" fill="var(--white)" />
        <circle cx="13" r="2" fill="var(--white)" />
      </g>;
    case "voltage":
      return <g data-symbol="dc-source" transform={negativeSource ? undefined : "scale(-1 1)"} stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <circle r="15" />
        <path d="M-22 0H-15M15 0H22M-9 0H9M4-4l5 4-5 4" />
      </g>;
    case "current":
      return <g transform={negativeSource ? "rotate(90)" : "rotate(-90)"} stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <path d="M0-22V-15M0 15V22" />
        <SourceGlyph x={0} y={0} scale={15 / 22} current />
      </g>;
    case "bridge":
      return <g stroke="var(--ink)" strokeWidth="1.7" fill="none">
        <path d="M-24 0H24" />
        {ground && <path data-symbol="ground" d="M0 0V9M-12 9H12M-8 14H8M-4 19H4" />}
      </g>;
    case "open":
    case "port":
      return <g stroke="var(--ink)" strokeWidth="1.7" fill="var(--white)">
        <path d="M-24 0H-11M11 0H24" />
        <circle cx="-8" r="3" />
        <circle cx="8" r="3" />
      </g>;
    default:
      return undefined;
  }
};
