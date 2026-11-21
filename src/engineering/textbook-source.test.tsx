import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TextbookSourceGlyph } from "./symbols";

test("Bessonov's equivalent-circuit source symbols use one E arrow and two collinear J arrows", () => {
  const emf = renderToStaticMarkup(<TextbookSourceGlyph x={0} y={0} kind="emf" />);
  const current = renderToStaticMarkup(<TextbookSourceGlyph x={0} y={0} kind="current" />);
  expect(emf).toContain('data-symbol="ideal-emf"');
  expect(current).toContain('data-symbol="ideal-current-source"');
  expect(emf.match(/data-source-arrow=/g)).toHaveLength(1);
  expect(current.match(/data-source-arrow=/g)).toHaveLength(2);
  expect(emf).not.toMatch(/<text|[+−]/);
  expect(current).toMatch(/M-2 0H-14[^"]*".*M14 0H2/);
});
