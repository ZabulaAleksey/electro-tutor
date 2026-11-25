import { execFileSync } from "node:child_process";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_CASE_TITLES } from "../../scripts/playwright-transport.mjs";

type Spec = { title: string; file: string; line: number; column: number; tests: { projectName: string }[] };
type Suite = { title: string; specs?: Spec[]; suites?: Suite[] };
type Case = { key: string; file: string; project: string; title: string };
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../../node_modules/@playwright/test/cli.js", import.meta.url));

function discover(config: string, remote: boolean, education: boolean): Case[] {
  const env: NodeJS.ProcessEnv = { ...process.env, E2E_EDUCATION: String(education), FORCE_COLOR: "0" };
  // The catalog audit reads its build root at module scope. Discovery only needs
  // an empty fixture directory; real E2E runs keep their actual build artifact.
  const emptyBuildRoot = mkdtempSync(join(tmpdir(), "electrotutor-discovery-"));
  env.BUILD_OUTPUT_DIR = emptyBuildRoot;
  delete env.E2E_AUTH_PHASE;
  delete env.E2E_SPEC;
  delete env.PW_TEST_CONNECT_WS_ENDPOINT;
  delete env.ELECTROTUTOR_REMOTE_WS_ENDPOINT;
  delete env.ELECTROTUTOR_REMOTE_WS_HEADERS;
  delete env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK;
  delete env.PW_TEST_CONNECT_HEADERS;
  delete env.PW_TEST_CONNECT_EXPOSE_NETWORK;
  if (remote) env.PW_TEST_CONNECT_WS_ENDPOINT = "ws://127.0.0.1:1/discovery-only";
  let output: string;
  try {
    output = execFileSync(process.execPath, [cli, "test", `--config=${config}`, "--list", "--reporter=json"], {
      cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    });
  } finally {
    rmdirSync(emptyBuildRoot);
  }
  const report = JSON.parse(output) as { suites: Suite[]; errors?: unknown[] };
  expect(report.errors ?? []).toEqual([]);
  const cases: Case[] = [];
  const visit = (suite: Suite, parents: string[]) => {
    const titles = [...parents, suite.title];
    for (const spec of suite.specs ?? []) {
      const file = spec.file.replaceAll("\\", "/");
      for (const test of spec.tests) cases.push({
        key: JSON.stringify([file, spec.line, spec.column, ...titles, spec.title]),
        file, project: test.projectName, title: [...titles.slice(1), spec.title].join(" "),
      });
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  };
  for (const suite of report.suites) visit(suite, []);
  return cases;
}

describe("actual Playwright discovery transport contract", () => {
  for (const [label, config, education] of [
    ["root", "playwright.config.ts", false],
    ["education", "playwright.config.ts", true],
    ["MVP", "playwright.mvp.config.ts", false],
  ] as const) {
    it(`${label}: preserves every logical case exactly once across transports`, () => {
      const baseline = discover(config, false, education);
      const remote = discover(config, true, education);
      // ET-LABC adds the star short scenario and the dedicated locus in RU/UK.
      expect(baseline.length).toBe(label === "root" ? 437 : label === "education" ? 439 : 33);
      expect(new Set(baseline.map(test => test.key)).size).toBe(baseline.length);
      expect(new Set(remote.map(test => test.key)).size).toBe(remote.length);
      expect(remote.map(test => test.key).sort()).toEqual(baseline.map(test => test.key).sort());
      expect(baseline.every(test => test.project === "chromium")).toBe(true);
      if (label === "MVP") {
        expect(remote.every(test => test.project === "chromium")).toBe(true);
        expect(remote.every(test => /(?:^|\/)mvp-[^/]+\.spec\.ts$/.test(test.file))).toBe(true);
      } else {
        const downloads = remote.filter(test => /(?:^|\/)circuit-parallel\.spec\.ts$/.test(test.file));
        expect(downloads).toHaveLength(7);
        const expectedLocal = new Set(DOWNLOAD_CASE_TITLES);
        const local = downloads.filter(test => test.project === "chromium-local-downloads");
        const remoteFile = downloads.filter(test => test.project === "chromium");
        expect(local).toHaveLength(4);
        expect(new Set(local.map(test => test.title))).toEqual(expectedLocal);
        expect(local.every(test => test.file === "circuit-parallel.spec.ts" || test.file.endsWith("/circuit-parallel.spec.ts"))).toBe(true);
        expect(new Set(remoteFile.map(test => test.title))).toEqual(new Set([
          "palette drag offers component region, cancel preserves source, ambiguity requires a choice",
          "UK touch and keyboard use the same region selection selects boundaries, previews and cancels without overflow",
          "equivalent model is explicit, reversible and preserves original editable components",
        ]));
        expect(local.length + remoteFile.length).toBe(7);
        expect(local.length).toBe(4);
        expect(remoteFile.length).toBe(3);
        expect(remote.filter(test => !downloads.includes(test)).every(test => test.project === "chromium")).toBe(true);
        expect(remote.filter(test => test.project === "chromium-local-downloads")).toHaveLength(4);
        expect(remote.filter(test => test.project === "chromium")).toHaveLength(baseline.length - 4);
      }
    }, 90_000);
  }
});
