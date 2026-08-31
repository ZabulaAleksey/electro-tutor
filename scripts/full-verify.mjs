import { spawn } from "node:child_process";
import { once } from "node:events";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const pnpmEntrypoint = process.env.npm_execpath;

export function resolvePnpmInvocation({ entrypoint = pnpmEntrypoint, platform = process.platform } = {}) {
  if (entrypoint && !/^node(?:\.exe)?$/i.test(basename(entrypoint))) {
    if (/\.(?:cmd|bat)$/i.test(entrypoint)) {
      return { command: entrypoint, argsPrefix: [], shell: true };
    }
    return /\.[cm]?js$/i.test(entrypoint)
      ? { command: process.execPath, argsPrefix: [entrypoint], shell: false }
      : { command: entrypoint, argsPrefix: [], shell: false };
  }

  return {
    command: platform === "win32" ? "pnpm.cmd" : "pnpm",
    argsPrefix: [],
    shell: platform === "win32",
  };
}

function spawnPnpm(args) {
  const invocation = resolvePnpmInvocation();
  return spawn(invocation.command, [...invocation.argsPrefix, ...args], {
    stdio: "inherit",
    shell: invocation.shell,
  });
}

export const fullVerifySteps = [
  ["install", "--frozen-lockfile"],
  ["run", "check:hygiene"],
  ["run", "check:ci-workflow"],
  ["run", "check"],
  ["run", "lint"],
  ["run", "test"],
  ["run", "test:e2e:root"],
  ["run", "build"],
  ["run", "test:e2e:production-smoke"],
  ["audit", "--audit-level", "high"],
];

export async function runFullVerify({ skipInstall = false } = {}) {
  const steps = skipInstall ? fullVerifySteps.slice(1) : fullVerifySteps;
  for (const args of steps) {
    console.log(`\n> pnpm ${args.join(" ")}`);
    const child = spawnPnpm(args);
    const [code] = await once(child, "exit");
    if (code !== 0) {
      throw new Error(`pnpm ${args.join(" ")} failed with exit code ${code}`);
    }
  }

  console.log("\nFull verification passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runFullVerify({ skipInstall: process.argv.includes("--skip-install") });
}
