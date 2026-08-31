import { spawn } from "node:child_process";
import { once } from "node:events";

async function runGit(args) {
  const child = spawn("git", args, { stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed with exit code ${code}`);
}

await runGit(["diff", "--check"]);
await runGit(["diff", "--cached", "--check"]);
await runGit(["show", "--check", "--format=", "HEAD"]);

console.log("Git whitespace hygiene checks passed.");
