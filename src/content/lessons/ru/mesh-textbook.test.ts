import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import katex from "katex";

describe("published RUN3B mathematical typography", () => {
  it("renders every authored formula strictly rather than silently printing a KaTeX error", () => {
    const mdx = readFileSync(new URL("./mesh-current-method.mdx", import.meta.url), "utf8");
    const formulas = [...mdx.matchAll(/<Formula[^>]*latex=\{String.raw`([^`]+)`\}/g)];
    expect(formulas.length).toBeGreaterThan(50);
    for (const [, formula] of formulas) {
      expect(() => katex.renderToString(formula, { throwOnError: true, strict: "error" }), formula).not.toThrow();
    }
  });
});
