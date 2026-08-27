import { describe, expect, it } from "vitest";
import { localePath, stripBasePath, withBasePath } from "./site-path";

describe("base-aware application paths", () => {
  it("keeps root deployment paths unchanged", () => {
    expect(withBasePath("/icons/potential.svg", "/")).toBe("/icons/potential.svg");
    expect(localePath("uk", "/interactive/", "/")).toBe("/uk/interactive/");
  });

  it("prefixes project paths exactly once", () => {
    expect(withBasePath("/icons/potential.svg", "/electro-tutor/")).toBe("/electro-tutor/icons/potential.svg");
    expect(localePath("ru", "/topics/", "/electro-tutor/")).toBe("/electro-tutor/ru/topics/");
    expect(stripBasePath("/electro-tutor/uk/", "/electro-tutor/")).toBe("/uk/");
  });

  it("preserves query and hash suffixes", () => {
    expect(withBasePath("/ru/interactive/?v=1#plot", "/project/")).toBe("/project/ru/interactive/?v=1#plot");
  });
});
