import { wasmLine } from "./helpers/wasm-line";
import { expect, test } from "@playwright/test";

const rawBasePath = process.env.E2E_BASE_PATH || "/";
const base = rawBasePath === "/" ? "/" : `/${rawBasePath.split("/").filter(Boolean).join("/")}/`;
const route = (path: string) => `${base}${path.replace(/^\/+/, "")}`;

test("transmission-line worker and WASM load under the configured static base path", async ({ page, request }) => {
  for (const asset of ["transient-core/transient_core.js", "transient-core/transient_core_bg.wasm"]) {
    expect((await request.get(route(asset))).ok(), asset).toBe(true);
  }
  await page.goto(route("uk/interactive/transmission-line/"));
  await expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
  const [[sample]]=await wasmLine(page,[{step:1}]);expect(sample.step).toBe(1);
});
