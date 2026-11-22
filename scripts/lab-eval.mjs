import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const mode = args[0] ?? "baseline";
if (args.length > 1 || !["baseline", "--negative", "--check-rejection"].includes(mode)) {
  console.error("Usage: pnpm eval:labs [--negative | --check-rejection]");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain");
const resultsRoot = join(root, "playwright-report", "lab-eval");
await mkdir(resultsRoot, { recursive: true });
const runDirectory = await mkdtemp(join(resultsRoot, "run-"));
const reportPath = join(runDirectory, "report.json");
const tempRoot = await realpath(tmpdir());
const buildDirectory = await mkdtemp(join(tempRoot, "electrotutor-lab-eval-"));
const artifact = join(buildDirectory, "site");
const started = performance.now();

const environment = {
  ...process.env,
  BUILD_OUTPUT_DIR: artifact,
  BASE_PATH: "/",
  SITE_URL: "https://electrotutor.example",
  PUBLIC_EDUCATION_MODE: "true",
  PUBLIC_MVP_MODE: "false",
};

const report = {
  schemaVersion: 1,
  revision,
  workingTree: dirty ? "dirty" : "clean",
  mode,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    chromium: chromium.executablePath().match(/chromium(?:_headless_shell)?-\d+/)?.[0] ?? "managed",
    buildProfile: "education",
    basePath: "/",
  },
  build: { status: "FAIL" },
  cases: [],
  status: "FAIL",
};

function run(file, args, env) {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => complete(code ?? 1));
  });
}

function casesIn(suite) {
  return [
    ...(suite.specs ?? []).flatMap((spec) => spec.tests.flatMap((test) => test.results.map((result) => {
      const measurement = result.attachments.find(({ name }) => name === "lab-measurements");
      return {
        project: test.projectName,
        status: result.status === "passed" ? "PASS" : result.status === "skipped" ? "SKIP" : "FAIL",
        durationMs: result.duration,
        measurements: measurement?.body && JSON.parse(Buffer.from(measurement.body, "base64").toString("utf8")),
        diagnostics: result.errors.map((error) => error.message),
        artifacts: result.attachments.filter(({ path }) => path).map(({ name, path }) => ({
          name,
          path: relative(runDirectory, resolve(root, path)).replaceAll("\\", "/"),
        })),
      };
    }))),
    ...(suite.suites ?? []).flatMap(casesIn),
  ];
}

async function runCase(name) {
  const directory = join(runDirectory, name);
  const exitCode = await run("node_modules/@playwright/test/cli.js", [
    "test", "--config", "playwright.lab-eval.config.ts",
  ], {
    ...environment,
    LAB_EVAL_OUTPUT: directory,
    LAB_EVAL_NEGATIVE: name === "negative" ? "1" : "0",
  });
  const result = { name, exitCode, tests: [], status: "FAIL" };
  report.cases.push(result);
  try {
    const native = JSON.parse(await readFile(join(directory, "playwright.json"), "utf8"));
    result.tests = native.suites.flatMap(casesIn);
    result.diagnostics = native.errors.map((error) => error.message);
  } catch (error) {
    result.diagnostics = [String(error)];
  }
  return result;
}

function hasProfiles(result, negative) {
  const profiles = [["desktop", "ru"], ["mobile", "uk"]];
  return result.tests.length === profiles.length && profiles.every(([project, locale]) => {
    const test = result.tests.find((row) => row.project === project);
    const measurement = test?.measurements;
    return measurement?.schemaVersion === 1 && measurement.evalId === "E5-matched-line"
      && measurement.locale === locale && measurement.negative === negative
      && Number.isInteger(measurement.seed) && Boolean(measurement.inputs)
      && test.artifacts.some(({ name }) => name === "matched-line")
      && test.artifacts.some(({ name }) => name === "trace");
  });
}

function baselinePassed(result) {
  return result.exitCode === 0 && result.diagnostics.length === 0 && hasProfiles(result, false)
    && result.tests.every(({ status }) => status === "PASS");
}

function rejectionConfirmed(result, baseline) {
  return result.exitCode === 1 && result.diagnostics.length === 0 && hasProfiles(result, true)
    && result.tests.every(({ project, status, diagnostics, measurements }) => {
      if (status !== "FAIL" || diagnostics.length !== 1 || !diagnostics[0]?.includes("[LAB_EVAL_REFERENCE_MISMATCH]")) return false;
      const { metrics } = measurements;
      const mismatches = metrics.filter(({ actual, expected, tolerance }) => Math.abs(actual - expected) > tolerance);
      if (mismatches.length !== 1 || mismatches[0].expected !== 60 || mismatches[0].unit !== "V") return false;
      if (!baseline) return true;
      const original = baseline.tests.find((test) => test.project === project).measurements;
      return original.seed === measurements.seed && original.metrics.length === metrics.length
        && JSON.stringify(original.inputs) === JSON.stringify(measurements.inputs)
        && metrics.every((metric, index) => {
          const base = original.metrics[index];
          return metric.id === base.id && metric.actual === base.actual && metric.unit === base.unit
            && metric.tolerance === base.tolerance
            && (metric === mismatches[0] ? base.expected === 50 : metric.expected === base.expected);
        });
    });
}

async function removeBuild() {
  const owned = await realpath(buildDirectory);
  if (owned !== buildDirectory || dirname(owned) !== tempRoot) {
    throw new Error("Build directory could not be verified for cleanup.");
  }
  await rm(owned, { recursive: true, force: true });
}

try {
  const buildStart = performance.now();
  const exitCode = await run("scripts/build-site.mjs", ["--education"], environment);
  report.build = { status: exitCode === 0 ? "PASS" : "FAIL", exitCode, durationMs: Math.round(performance.now() - buildStart) };
  if (exitCode !== 0) throw new Error("Education build failed.");

  const first = await runCase(mode === "--negative" ? "negative" : "baseline");
  if (mode === "--negative") {
    first.referenceRejected = rejectionConfirmed(first);
    if (!first.referenceRejected) throw new Error("Negative fixture did not produce the expected isolated mismatch.");
    process.exitCode = 1;
  } else {
    if (!baselinePassed(first)) throw new Error("Baseline eval failed or produced incomplete evidence.");
    first.status = "PASS";
    if (mode === "--check-rejection") {
      const rejection = await runCase("negative");
      rejection.referenceRejected = rejectionConfirmed(rejection, first);
      if (!rejection.referenceRejected) throw new Error("Negative fixture did not produce the expected isolated mismatch.");
    }
    report.status = "PASS";
  }
} catch (error) {
  report.error = String(error);
  process.exitCode = mode === "--negative" ? 2 : 1;
} finally {
  try {
    await removeBuild();
  } catch (error) {
    report.cleanupError = String(error);
    report.status = "FAIL";
    process.exitCode = 2;
  }
  report.durationMs = Math.round(performance.now() - started);
  report.exitCode = process.exitCode ?? 0;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`Lab eval ${report.status}: ${reportPath}`);
}
