import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = process.cwd();
const temporaryRoot = resolve(tmpdir());
const outputDirectory = await mkdtemp(join(temporaryRoot, "electro-tutor-base-"));
const environment = {
  ...process.env,
  SITE_URL: "https://example.invalid",
  BASE_PATH: "/electro-tutor/",
  BUILD_OUTPUT_DIR: outputDirectory,
  E2E_SPEC: "tests/e2e/base-path.spec.ts",
  E2E_BASE_PATH: "/electro-tutor/",
};
const resolvedOutput = resolve(outputDirectory);
if (!resolvedOutput.startsWith(`${temporaryRoot}\\`) && !resolvedOutput.startsWith(`${temporaryRoot}/`)) {
  throw new Error(`Refusing to use unexpected build directory: ${resolvedOutput}`);
}

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
  console.log("Project-base verification passed for /electro-tutor/.");
} finally {
  await rm(resolvedOutput, { recursive: true, force: true });
}
