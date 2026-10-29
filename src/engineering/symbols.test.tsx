import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResistorGlyph, SourceGlyph, SupportGlyph, SYMBOL_GEOMETRY } from "./symbols";
import { CircuitView } from "../showcase/MicroVisual";
import { microLabs } from "../showcase/micro-catalog";
import {CircuitVisual} from "../showcase/SceneVisual";
import {INITIAL,type SceneKind} from "../showcase/physics";
import CircuitDiagram from "../components/CircuitDiagram";
const attr = (text: string, name: string) => Number(new RegExp(`\\b${name}="([^"]+)"`).exec(text)?.[1]);
describe("canonical engineering symbol geometry", () => {
  it("resistor10:4 body and terminals remain invariant for all scale/mode/orientation combinations", () => {
    expect(SYMBOL_GEOMETRY.resistor.width / SYMBOL_GEOMETRY.resistor.height).toBe(2.5);
    for (const orientation of ["horizontal", "vertical"] as const) for (const scale of [.5, 1, 2]) for (const mode of ["full", "thumbnail", "export"] as const) {
      const svg = renderToStaticMarkup(createElement(ResistorGlyph, { x: 100, y: 60, scale, mode, orientation })), rect = /<rect([^>]+)>/.exec(svg)![1];
      const width = attr(rect, "width"), height = attr(rect, "height");
      expect(orientation === "horizontal" ? width / height : height / width).toBe(2.5);
      expect(attr(svg, "stroke-width")).toBeCloseTo(1.7 * scale, 12);
      expect(svg).toContain(`data-terminals="${orientation === "horizontal" ? `100,60;${100 + 58 * scale},60` : `100,60;100,${60 + 58 * scale}`}"`);
    }
  });
  it("pin/roller/fixed sides have distinct physical geometry, current/voltage sources distinct semantics", () => {
    const render = (kind: "pin" | "roller" | "fixed-left" | "fixed-right") => renderToStaticMarkup(createElement(SupportGlyph, { kind, x: 10, y: 20 }));
    expect(render("roller").match(/<circle/g)).toHaveLength(3); expect(render("pin").match(/<circle/g)).toHaveLength(1);
    expect(render("fixed-left")).not.toContain("scale(-1 1)"); expect(render("fixed-right")).toContain("scale(-1 1)");
    expect(renderToStaticMarkup(createElement(SourceGlyph, { x: 0, y: 0, current: true }))).toContain('data-symbol="current-source"');
    expect(renderToStaticMarkup(createElement(SourceGlyph, { x: 0, y: 0 }))).toContain('data-symbol="dc-source"');
  });
  for (const lab of microLabs) it(`reviewable SVG golden ${lab.id}`, () => {
    const svg = renderToStaticMarkup(createElement(CircuitView, { lab, a: lab.parameters[0].initial, b: lab.parameters[1].initial, language: "ru" }));
    expect(svg).not.toMatch(/NaN|undefined|Infinity/); expect(svg).toMatchSnapshot();
    if (!["rms", "control"].includes(lab.model)) expect(svg).toContain("data-symbol=");
  });
});

for(const kind of ["dc","ac","three","rc","diode","neutral","line","magnet"] as SceneKind[])it(`shared scene SVG: ${kind}`,()=>expect(renderToStaticMarkup(createElement(CircuitVisual,{kind,parameters:INITIAL,language:"ru"}))).toMatchSnapshot());
it("reference lesson uses canonical R geometry",()=>expect(renderToStaticMarkup(createElement(CircuitDiagram,{language:"ru"}))).toMatchSnapshot());
