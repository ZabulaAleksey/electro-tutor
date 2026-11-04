import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { meshPreset } from "../models/mesh-current";
import MeshLabScheme from "./MeshLabScheme";
for (const example of [1, 2, 3, 4] as const) test(`live scheme${example} retains connected physical glyph ports without bypass`, () => {
  const html = renderToStaticMarkup(<MeshLabScheme p={meshPreset(example)} active="R1" loop={1} />);
  const graph = new Map<string, Set<string>>();
  for (const [, x, y, a, b] of html.matchAll(/data-wire-from="[^"]+" data-wire-to="[^"]+" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)"/g)) {
    const from = `${x},${y}`, to = `${a},${b}`;
    if (!graph.has(from)) graph.set(from, new Set()); if (!graph.has(to)) graph.set(to, new Set()); graph.get(from)!.add(to); graph.get(to)!.add(from);
  }
  const glyphs = [...html.matchAll(/<g[^>]*data-symbol="([^"]+)"[^>]*data-terminals="([^"]+)"/g)];
  expect(glyphs.filter(x => x[1] === "resistor")).toHaveLength(example === 3 ? 4 : example === 4 ? 2 : 3);
  expect(glyphs.filter(x => x[1] === "reference-emf")).toHaveLength(example === 2 || example === 3 ? 2 : 1);
  expect(glyphs.filter(x => x[1] === "current-source")).toHaveLength(example === 4 ? 1 : 0);
  for (const [, kind, terminals] of glyphs) {
    const [a, b] = terminals.split(";"); expect(graph.has(a), `${kind}: disconnected ${a}`).toBe(true); expect(graph.has(b), `${kind}: disconnected ${b}`).toBe(true);
    const seen = new Set([a]), queue = [a]; while (queue.length) for (const next of graph.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    expect(seen.has(b), `${kind}: wire shorts component`).toBe(false);
  }
  expect([...html.matchAll(/data-mesh-current=/g)]).toHaveLength(example === 3 ? 3 : 2); expect(html).toContain('role="img"');
  if (example === 3) expect(html).toContain('<text x="320" y="163">−</text>');
  if (example === 4) { expect(html).toContain('data-current-direction="A-to-B"'); const p = meshPreset(4); p.current = -1; expect(renderToStaticMarkup(<MeshLabScheme p={p} active="J" loop={2} />)).toContain('data-current-direction="B-to-A"'); }
});
