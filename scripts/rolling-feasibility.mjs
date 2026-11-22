import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { runRollingE10 } from "./rolling-e10.mjs";
import { solveRollingFeasibility } from "../src/rolling/feasibility.mjs";
import { verifyRollingReplay } from "../src/rolling/replay.mjs";

const maxInputBytes = 32 * 1024;
const publicDiagnostics = new Set([
  "USAGE", "INPUT_FILE", "BUDGET_EXCEEDED", "INVALID_INPUT", "DEGENERATE_TRACE",
  "NO_CERTIFIED_SHAPE", "CONTACT_NOT_CERTIFIED",
]);

async function readInput(path) {
  const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);
  const file = await open(path, flags).catch(() => { throw Error("INPUT_FILE"); });
  try {
    const info = await file.stat();
    if (!info.isFile()) throw Error("INPUT_FILE");
    if (info.size > maxInputBytes) throw Error("BUDGET_EXCEEDED");
    const bytes = Buffer.alloc(maxInputBytes + 1);
    let count = 0;
    while (count < bytes.length) {
      const next = await file.read(bytes, count, bytes.length - count);
      if (!next.bytesRead) break;
      count += next.bytesRead;
    }
    if (count > maxInputBytes) throw Error("BUDGET_EXCEEDED");
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count)));
    } catch {
      throw Error("INVALID_INPUT");
    }
  } finally {
    await file.close();
  }
}

async function main(args) {
  if (args.length !== 1 || (args[0].startsWith("--") && args[0] !== "--eval")) throw Error("USAGE");
  if (args[0] === "--eval") return runRollingE10();
  const { shape, poses } = solveRollingFeasibility(await readInput(args[0]));
  const verification = verifyRollingReplay(shape, poses);
  return { schemaVersion: 1, verdict: "FEASIBLE", class: "guided-finite-rolling", shape, poses, verification };
}

try {
  process.stdout.write(JSON.stringify(await main(process.argv.slice(2)), null, 2) + "\n");
} catch (error) {
  const code = publicDiagnostics.has(error.message) ? error.message : "E10_CHECK_FAILED";
  const usage = code === "USAGE" ? "node scripts/rolling-feasibility.mjs --eval | <trace.json>" : undefined;
  const assertion = error.code === "ERR_ASSERTION" ? error.message : undefined;
  process.stderr.write(JSON.stringify({ verdict: "REJECTED", code, usage, assertion }) + "\n");
  process.exitCode = 1;
}
