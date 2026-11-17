import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Options = {
  windows?: boolean;
  matchBase?: boolean;
  capture?: boolean;
  ignore?: string;
  onResult?: (result: Record<string, unknown>) => void;
  onMatch?: (result: Record<string, unknown>) => void;
  onIgnore?: (result: Record<string, unknown>) => void;
};
type MatcherResult = Record<string, unknown> & { isMatch?: boolean; match?: RegExpExecArray | null };
type Matcher = (input: string, returnObject?: boolean) => boolean | MatcherResult;
type Picomatch = {
  (pattern: string, options?: Options, returnState?: boolean): Matcher;
  compileRe: (state: Record<string, unknown>, options?: Options) => RegExp;
  isMatch: (input: string, pattern: string, options?: Options) => boolean;
  makeRe: (pattern: string, options?: Options) => RegExp;
  parse: (pattern: string, options?: Options) => Record<string, unknown>;
  scan: (pattern: string, options?: { parts?: boolean }) => Record<string, unknown>;
};

const require = createRequire(import.meta.url);
const packageEntry = require.resolve("picomatch");
const picomatch = require(packageEntry) as Picomatch;
const posix = require(require.resolve("picomatch/posix")) as Picomatch;
const packageManifest = JSON.parse(readFileSync(require.resolve("picomatch/package.json"), "utf8")) as { name: string; version: string };
const timeoutMs = 5_000;

function hostileEvaluation(api: "matcher" | "makeRe" | "parse-compileRe", pattern: string) {
  const entry = JSON.stringify(packageEntry);
  const glob = JSON.stringify(pattern);
  const source = api === "matcher"
    ? `const p=require(${entry});process.stdout.write(String(p(${glob})("a".repeat(64*1024)+"b")));`
    : api === "makeRe"
      ? `const p=require(${entry});process.stdout.write(String(p.makeRe(${glob}).test("a".repeat(64*1024)+"b")));`
      : `const p=require(${entry});process.stdout.write(String(p.compileRe(p.parse(${glob})).test("a".repeat(64*1024)+"b")));`;
  const child = spawnSync(process.execPath, ["-e", source], {
    cwd: process.cwd(), encoding: "utf8", timeout: timeoutMs, windowsHide: true,
  });
  if (child.error && "code" in child.error && child.error.code === "ETIMEDOUT") return { timedOut: true };
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(child.stderr || `child exited with ${child.status}`);
  return { timedOut: false, matched: child.stdout.trim() === "true" };
}

describe("picomatch security replacement", () => {
  it("pins the reviewed parser and every active consumer through the unchanged lock graph", () => {
    const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    expect(hash(readFileSync(require.resolve("picomatch/lib/parse"))))
      .toBe("2d26afdd15b3b164d8bed0916f6c21a03322d7b36e3efe2b2cd47f5a45b90232");
    expect(hash(readFileSync(require.resolve("picomatch/lib/constants"))))
      .toBe("c28f952d2758261fe5428a121add485cc25b03e0193633f649de903dc0e5e222");
    type Snapshot = { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    const lock = parseYaml(readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8")) as {
      overrides: Record<string, string>;
      patchedDependencies: Record<string, string>;
      packages: Record<string, { resolution: { integrity: string } }>;
      snapshots: Record<string, Snapshot>;
    };
    const fork = "@ryotsu/picomatch@4.0.7-a";
    expect(lock.overrides.picomatch).toBe(`npm:${fork}`);
    const patchHash = hash(readFileSync(new URL("../../patches/@ryotsu__picomatch@4.0.7-a.patch", import.meta.url)));
    expect(lock.patchedDependencies[fork]).toBe(patchHash);
    expect(Object.keys(lock.packages).filter(name => /^(?:@[^/]+\/)?picomatch@/.test(name))).toEqual([fork]);
    expect(lock.packages[fork].resolution.integrity).toBe("sha512-JroBFEmaejC7szGSfqOhF1QZHLKvX2wTA1+fWyfkpy3BjzdQKNPLKa2FtgeKVUDy5/UPUNkXEeCHJ5ZRBMLTVA==");
    let checked = 0;
    for (const snapshot of Object.values(lock.snapshots)) {
      for (const group of [snapshot.dependencies, snapshot.optionalDependencies]) {
        if (group?.picomatch) {
          expect(group.picomatch).toBe(`${fork}(patch_hash=${patchHash})`);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(9);
  });

  it("preserves the ESM default import and safely handles adversarial option variants", () => {
    const source = `
      import assert from 'node:assert/strict';
      import pm from ${JSON.stringify(pathToFileURL(packageEntry).href)};
      assert.equal(pm('*.js')('index.js'), true);
      const cases = [
        ['+(*a)', 'a'.repeat(80)+'!'], ['*(*)b', 'a'.repeat(80)+'!'],
        ['+(a*b)', 'ab'.repeat(40)+'!'], ['+(*)', 'a'.repeat(80)+'/'],
        ['+(?(*a))', 'a'.repeat(80)+'!'], ['+(*{a,b})', 'a'.repeat(80)+'!'],
        ['+(@(*a))', 'a'.repeat(80)+'!'], ['+(a\\*b)', 'a'.repeat(80)+'!']
      ];
      for (const options of [{}, {windows:true}, {capture:true}, {fastpaths:false}]) {
        for (const [pattern, input] of cases) {
          assert.equal(pm(pattern, options)(input), false, pattern);
          assert.equal(pm.makeRe(pattern, options).test(input), false, pattern);
          assert.equal(pm.compileRe(pm.parse(pattern, options), options).test(input), false, pattern);
        }
      }
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      encoding: "utf8", timeout: timeoutMs, windowsHide: true,
    });
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
  }, 10_000);

  it("executes the pinned fork, not an unverified package with the same API", () => {
    expect(packageManifest).toMatchObject({ name: "@ryotsu/picomatch", version: "4.0.7-a" });
    for (const pattern of ["+(*a)", "*(*)a"]) {
      for (const api of ["matcher", "makeRe", "parse-compileRe"] as const) {
        const result = hostileEvaluation(api, pattern);
        expect(result.timedOut, `${api} timed out for ${pattern}`).toBe(false);
        expect(result.matched, `${api} unexpectedly matched hostile tail for ${pattern}`).toBe(false);
      }
    }
  });

  it("keeps the normal matcher, path, callback, scan and parser contracts", () => {
    const corpus: readonly [string, string, boolean][] = [
      ["*.js", "index.js", true],
      ["*.js", "src/index.js", false],
      ["src/**/*.ts", "src/lib/a.ts", true],
      ["!(*.test).js", "app.js", true],
      ["!(*.test).js", "app.test.js", false],
      ["*.{js,ts}", "index.ts", true],
      ["src/**/test?.[jt]s", "src/a/test1.js", true],
      ["src/**/test?.[jt]s", "src/a/test1.css", false],
      ["**/*.js", "nested/deep/index.js", true],
      ["**.js", "x/a.js", true],
      ["**.js", "foo/x/a.js", true],
      ["[!abc].js", "d.js", false],
      ["[!abc].js", "a.js", true],
      ["**/*.js", "nested/\nindex.js", false],
    ];
    for (const [pattern, input, expected] of corpus) expect(picomatch.isMatch(input, pattern)).toBe(expected);

    expect(picomatch("src/*.js", { windows: true })("src\\a.js")).toBe(true);
    expect(posix("src/*.js")("src/a.js")).toBe(true);
    expect(picomatch("*.js", { matchBase: true })("src/a.js")).toBe(true);

    const callbacks: string[] = [];
    const matcher = picomatch("*.js", {
      onResult: () => callbacks.push("result"), onMatch: () => callbacks.push("match"),
    });
    expect(matcher("a.js")).toBe(true);
    expect(callbacks).toEqual(["result", "match"]);
    callbacks.length = 0;
    const ignored = picomatch("*.js", {
      ignore: "a.js", onResult: () => callbacks.push("result"), onIgnore: () => callbacks.push("ignore"),
    });
    expect(ignored("a.js")).toBe(false);
    expect(callbacks).toEqual(["result", "ignore"]);

    const scan = picomatch.scan("!./src/**/*.js", { parts: true });
    expect(scan).toMatchObject({ base: "src", glob: "**/*.js", isGlobstar: true, negated: true });
    expect(scan.parts).toEqual(["src", "**", "*.js"]);
    const state = picomatch.parse("src/**/*.js");
    expect(typeof state.output).toBe("string");
    expect(picomatch.compileRe(state).test("src/a.js")).toBe(true);

    const captured = picomatch("src/*.js", { capture: true })("src/a.js", true) as MatcherResult;
    expect(captured.isMatch).toBe(true);
    // Capture group count is intentionally not pinned: the fork may harden regex
    // grouping while preserving the public match result and matched input.
    expect(captured.match?.[0]).toBe("src/a.js");
  });
});
