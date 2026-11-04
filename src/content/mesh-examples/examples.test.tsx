import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import katex from "katex";
import MeshExampleDiagram from "../../components/MeshExampleDiagram";

test("all authored worked-example mathematics parses strictly", () => {
  const source = readFileSync(new URL("./ru.mdx", import.meta.url), "utf8");
  const formulas = [...source.matchAll(/latex=\{String.raw`([^`]+)`\}/g)];
  expect(formulas.length).toBeGreaterThan(100);
  for (const [, latex] of formulas) expect(() => katex.renderToString(latex, { throwOnError: true, strict: "error" }), latex).not.toThrow();
});

for (const example of [1, 2, 3, 4] as const) test(`example${example} physical glyph ports connect without a wire bypass`, () => {
  const html = renderToStaticMarkup(<MeshExampleDiagram example={example} />);
  const adjacency = new Map<string, Set<string>>();
  for (const [, x1, y1, x2, y2] of html.matchAll(/data-wire-from="[^"]+" data-wire-to="[^"]+" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)"/g)) {
    const a = `${x1},${y1}`, b = `${x2},${y2}`;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b); adjacency.get(b)!.add(a);
  }
  expect(adjacency.size).toBeGreaterThan(10);
  const symbols = [...html.matchAll(/<g[^>]*data-symbol="([^"]+)"[^>]*data-terminals="([^"]+)"/g)];
  expect(symbols.filter(x => x[1] === "resistor")).toHaveLength(example === 3 ? 4 : example === 4 ? 2 : 3);
  expect(symbols.filter(x => x[1] === "reference-emf")).toHaveLength(example === 2 || example === 3 ? 2 : 1);
  expect(symbols.filter(x => x[1] === "current-source")).toHaveLength(example === 4 ? 1 : 0);
  for (const [, kind, terminals] of symbols) {
    const [a, b] = terminals.split(";");
    expect(adjacency.has(a), `${kind} terminal${a} disconnected`).toBe(true);
    expect(adjacency.has(b), `${kind} terminal${b} disconnected`).toBe(true);
    const visited = new Set([a]); const queue = [a];
    while (queue.length) for (const next of adjacency.get(queue.shift()!) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next); }
    expect(visited.has(b), `${kind} bypassed by a wire`).toBe(false);
  }
  expect([...html.matchAll(/data-mesh-current=/g)]).toHaveLength(example === 3 ? 3 : 2);
  if (example === 4) {
    expect(html).toContain('transform="rotate(180 180 180)" data-current-direction="A-to-B"');
    expect(html).toContain('data-supermesh="outer"');
  }
});
