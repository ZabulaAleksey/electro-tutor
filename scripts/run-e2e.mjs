import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const port = 4322;
const baseURL = `http://${host}:${port}`;
const projectRoot = process.cwd();

function spawnNode(modulePath, args, options = {}) {
  return spawn(process.execPath, [resolve(projectRoot, modulePath), ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }

  const [code, signal] = await once(child, "exit");
  return { code, signal };
}

async function waitUntilReady(preview, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (preview.exitCode !== null || preview.signalCode !== null) {
      throw new Error(
        `Astro preview exited before it became ready (code=${preview.exitCode}, signal=${preview.signalCode}).`,
      );
    }

    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The preview socket is not ready yet.
    }

    await delay(100);
  }

  throw new Error(`Astro preview did not become ready at ${baseURL} within ${timeoutMs}ms.`);
}

async function stopPreview(preview) {
  if (preview.exitCode !== null || preview.signalCode !== null) return;

  preview.kill("SIGTERM");
  const graceful = await Promise.race([
    waitForExit(preview).then(() => true),
    delay(5_000, false),
  ]);
  if (graceful) return;

  preview.kill("SIGKILL");
  const forced = await Promise.race([
    waitForExit(preview).then(() => true),
    delay(2_000, false),
  ]);
  if (!forced) throw new Error(`Unable to stop Astro preview process ${preview.pid}.`);
}

const preview = spawnNode("node_modules/astro/bin/astro.mjs", [
  "preview",
  "--host",
  host,
  "--port",
  String(port),
]);

let exitCode = 1;

try {
  await waitUntilReady(preview);
  const playwright = spawnNode("node_modules/@playwright/test/cli.js", ["test"], {
    env: { ...process.env, E2E_EXTERNAL_SERVER: "1" },
  });
  const result = await waitForExit(playwright);
  exitCode = result.code ?? 1;
} finally {
  await stopPreview(preview);
}

process.exitCode = exitCode;
