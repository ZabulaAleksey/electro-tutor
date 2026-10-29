import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CircuitView } from "../showcase/MicroVisual";
import { microLabs } from "../showcase/micro-catalog";
import {CircuitVisual} from "../showcase/SceneVisual";
import {INITIAL,type SceneKind} from "../showcase/physics";
import CircuitDiagram from "../components/CircuitDiagram";
type XY = [number, number];
type Wire = [XY, XY];
function wiresFrom(svg: string): Wire[] {
  const result: Wire[] = [];
  for (const [tag] of svg.matchAll(/<path\b[^>]+>/g)) {
    if (tag.includes("marker-end=")) continue;
    const d = /\bd="([^"]+)"/.exec(tag)?.[1]; if (!d) continue;
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) ?? [];
    let index = 0, command = "", previous: XY = [0, 0];
    while (index < tokens.length) {
      if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++];
      const relative = command === command.toLowerCase(), op = command.toUpperCase();
      if (!["M", "L", "H", "V"].includes(op)) throw Error(`Unexpected external-wire command ${command}`);
      const n = Number(tokens[index++]); let at: XY;
      if (op === "H") at = [n + (relative ? previous[0] : 0), previous[1]];
      else if (op === "V") at = [previous[0], n + (relative ? previous[1] : 0)];
      else at = [n + (relative ? previous[0] : 0), Number(tokens[index++]) + (relative ? previous[1] : 0)];
      if (op !== "M") result.push([previous, at]); previous = at;
    }
  }
  return result;
}
function on(p: XY, [a, b]: Wire) { const epsilon = 1e-6; return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < epsilon && p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon; }
function verify(svg:string,expected?:number[]){
  const symbols = [...svg.matchAll(/<g\b[^>]*data-symbol="[^"]+"[^>]*>[\s\S]*?<\/g>/g)].map(([g]) => g);
  const terminals: [XY, XY][] = symbols.map(g => { const text = /data-terminals="([^"]+)"/.exec(g)?.[1]; expect(text, g).toBeTruthy(); return text!.split(";").map(v => v.split(",").map(Number)) as [XY, XY]; });
  let external = svg.replace(/<defs>[\s\S]*?<\/defs>/, ""); for (const g of symbols) external = external.replace(g, "");
  const wires = wiresFrom(external), points = [...wires.flat(), ...terminals.flat()], parent = points.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : parent[i] = root(parent[i]);
  const join = (a: number, b: number) => { parent[root(a)] = root(b); };
  // Only endpoint/T joins are connected. A geometric crossing alone is not a junction.
  points.forEach((p, i) => points.forEach((q, j) => { if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6) join(i, j); }));
  for (const wire of wires) { const ids = points.flatMap((p, i) => on(p, wire) ? [i] : []); for (const i of ids) join(i, ids[0]); }
  const net = (p: XY) => root(points.findIndex(q => q === p));
  const degrees = new Map<number, number>();
  for (const pair of terminals) for (const pin of pair) expect(wires.some(w => on(pin, w)), `dangling terminal ${pin} in rendered circuit`).toBe(true);
  for (const [a, b] of terminals) { const u = net(a), v = net(b); expect(u, `wire bypass in rendered circuit`).not.toBe(v); degrees.set(u, (degrees.get(u) ?? 0) + 1); degrees.set(v, (degrees.get(v) ?? 0) + 1); }
  expect([...degrees.values()].sort()).toEqual(expected ?? Array(terminals.length).fill(2));
}

for (const lab of microLabs.filter(l=>l.model!=="rms"&&l.model!=="control"))it(`actual terminal topology: ${lab.id}`,()=>verify(renderToStaticMarkup(createElement(CircuitView,{lab,a:lab.parameters[0].initial,b:lab.parameters[1].initial,language:"ru"})),lab.model==="parallel"?[3,3]:lab.model==="star"?[1,1,1,3]:undefined));
for(const kind of ["dc","ac","three","rc","diode","neutral","line"] as SceneKind[])it(`shared showcase symbol ports: ${kind}`,()=>verify(renderToStaticMarkup(createElement(CircuitVisual,{kind,parameters:INITIAL,language:"ru"})),kind==="three"||kind==="neutral"?[1,1,1,3]:undefined));
it("reference lesson has two genuine mesh loops and no hidden wire bypass",()=>verify(renderToStaticMarkup(createElement(CircuitDiagram,{language:"ru"})),[2,2,3,3]));
