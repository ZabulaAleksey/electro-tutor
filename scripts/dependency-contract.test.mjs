import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("pnpm dependency materialization contract", () => {
  it("keeps the virtual store project-local for clean Linux builds", async () => {
    const workspace = parse(await readFile("pnpm-workspace.yaml", "utf8"));
    const astroEntry = await realpath(fileURLToPath(import.meta.resolve("astro")));
    const localVirtualStore = resolve("node_modules/.pnpm");
    const materializedPath = relative(localVirtualStore, astroEntry);

    expect(workspace.virtualStoreType).not.toBe("global");
    expect(workspace.allowBuilds).toEqual({ esbuild: true, workerd: true });
    expect(isAbsolute(materializedPath) || materializedPath.startsWith(".."))
      .toBe(false);
  });
});
