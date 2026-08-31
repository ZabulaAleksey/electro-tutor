import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const child = spawn(process.execPath, [resolve("scripts/run-e2e.mjs")], {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_BASE_PATH: process.env.BASE_PATH || "/",
    E2E_SPEC: "tests/e2e/base-path.spec.ts",
  },
});
const [code] = await once(child, "exit");
if (code !== 0) throw new Error(`Production artifact E2E smoke failed with exit code ${code}`);

console.log("Production artifact E2E smoke passed.");
