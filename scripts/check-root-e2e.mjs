import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = process.cwd();
const temporaryRoot = resolve(tmpdir());
const outputDirectory = await mkdtemp(join(temporaryRoot, "electro-tutor-root-"));
const environment = {
  ...process.env,
  SITE_URL: "https://example.invalid",
  BASE_PATH: "/",
  BUILD_OUTPUT_DIR: outputDirectory,
  E2E_BASE_PATH: "/",
  E2E_SPEC: "",
};

async function run(modulePath, args = []) {
  const child = spawn(process.execPath, [resolve(projectRoot, modulePath), ...args], {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${modulePath} failed with exit code ${code}`);
}

try {
  await run("scripts/validate-locales.mjs");
  await run("node_modules/astro/bin/astro.mjs", ["build"]);
  await run("scripts/audit-built-locales.mjs");
  await run("scripts/audit-built-lessons.mjs");
  await run("scripts/audit-built-site.mjs");
  await run("scripts/run-e2e.mjs");
  console.log("Full root-artifact Chromium E2E verification passed.");
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
