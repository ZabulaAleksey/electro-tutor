import { describe, expect, it } from "vitest";
import { normalizeBasePath, normalizeSiteOrigin } from "./site-contract.mjs";

describe("site/base configuration contract", () => {
  it("normalizes root and project paths", () => {
    expect(normalizeBasePath()).toBe("/");
    expect(normalizeBasePath("")).toBe("/");
    expect(normalizeBasePath("electro-tutor")).toBe("/electro-tutor/");
    expect(normalizeBasePath("/electro-tutor/")).toBe("/electro-tutor/");
  });

  it("rejects origins, query and traversal in BASE_PATH", () => {
    for (const value of ["https://example.com/app", "/app?x=1", "/app#x", "/../app"]) {
      expect(() => normalizeBasePath(value)).toThrow(/BASE_PATH/);
    }
  });

  it("keeps SITE_URL and BASE_PATH as separate concerns", () => {
    expect(normalizeSiteOrigin("https://example.com/")).toBe("https://example.com");
    expect(() => normalizeSiteOrigin("https://example.com/app")).toThrow(/BASE_PATH/);
    expect(() => normalizeSiteOrigin("file:///tmp/site")).toThrow(/http or https/);
  });
});
