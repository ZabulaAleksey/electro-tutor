import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { fullVerifySteps } from "./full-verify.mjs";

const fullSha = /^[0-9a-f]{40}$/;
const requiredRuns = [
  "pnpm install --frozen-lockfile",
  "pnpm run verify:full -- --skip-install",
];
const requiredActions = [
  "actions/checkout",
  "pnpm/setup",
  "actions/configure-pages",
  "actions/upload-pages-artifact",
  "actions/deploy-pages",
];
const requiredFullVerifyCommands = [
  "install --frozen-lockfile",
  "run check:hygiene",
  "run check:ci-workflow",
  "run check",
  "run lint",
  "run test",
  "run test:e2e:root",
  "run build",
  "run test:e2e:production-smoke",
  "audit --audit-level high",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function actionRef(step) {
  if (typeof step?.uses !== "string") return null;
  const separator = step.uses.lastIndexOf("@");
  if (separator < 1) return null;
  return { action: step.uses.slice(0, separator), ref: step.uses.slice(separator + 1) };
}

export function validateFullVerifyContract(steps) {
  const commands = steps.map((args) => args.join(" "));
  assert(
    commands.length === requiredFullVerifyCommands.length &&
      requiredFullVerifyCommands.every((command, index) => commands[index] === command),
    "Full verification steps must preserve the required gate order.",
  );
}

export function validatePagesWorkflow(source, fullVerificationSteps = fullVerifySteps) {
  validateFullVerifyContract(fullVerificationSteps);
  const workflow = parse(source);
  const verify = workflow?.jobs?.verify;
  const deploy = workflow?.jobs?.deploy;
  assert(verify, "Workflow must define a verify job.");
  assert(deploy, "Workflow must define a deploy job.");
  assert(deploy.needs === "verify", "Deploy must depend directly on verify.");
  assert(
    verify.if === "github.ref == 'refs/heads/main'" && deploy.if === "github.ref == 'refs/heads/main'",
    "Manual and automatic publication must be restricted to main.",
  );
  assert(workflow?.concurrency?.["cancel-in-progress"] === true, "Stale runs must be cancelled.");
  assert(verify.permissions?.contents === "read", "Verify must have contents: read only.");
  assert(Object.keys(verify.permissions).length === 1, "Verify permissions must be minimal.");
  assert(deploy.permissions?.pages === "write", "Deploy must have pages: write.");
  assert(deploy.permissions?.["id-token"] === "write", "Deploy must have id-token: write.");
  assert(deploy.permissions?.actions === "read", "Deploy must have actions: read.");
  assert(Object.keys(deploy.permissions).length === 3, "Deploy permissions must be minimal.");

  const verifySteps = verify.steps ?? [];
  const deploySteps = deploy.steps ?? [];
  const allSteps = [...verifySteps, ...deploySteps];
  const runs = verifySteps.map((step) => step.run).filter(Boolean);
  for (const command of requiredRuns) {
    assert(runs.includes(command), `Verify is missing required command: ${command}`);
  }

  const checkout = verifySteps.find((step) => actionRef(step)?.action === "actions/checkout");
  assert(checkout?.with?.["persist-credentials"] === false, "Checkout credentials must not persist.");

  const uploadIndex = verifySteps.findIndex(
    (step) => actionRef(step)?.action === "actions/upload-pages-artifact",
  );
  const verificationIndex = verifySteps.findIndex(
    (step) => step.run === "pnpm run verify:full -- --skip-install",
  );
  assert(uploadIndex > verificationIndex, "Pages artifact must be uploaded only after full verification.");
  assert(verifySteps[uploadIndex]?.with?.path === "./dist", "Only dist must be uploaded.");
  assert(
    deploySteps.some((step) => actionRef(step)?.action === "actions/deploy-pages"),
    "Deploy must consume the uploaded Pages artifact.",
  );
  assert(
    deploySteps.length === 1 && actionRef(deploySteps[0])?.action === "actions/deploy-pages",
    "Deploy must contain only deploy-pages and must not checkout, install or rebuild.",
  );

  const actionRefs = allSteps.map(actionRef).filter(Boolean);
  for (const action of requiredActions) {
    assert(actionRefs.some((entry) => entry.action === action), `Workflow is missing ${action}.`);
  }
  for (const { action, ref } of actionRefs) {
    assert(fullSha.test(ref), `${action} must be pinned to a full commit SHA.`);
  }

  return workflow;
}

export async function validatePagesWorkflowFile(path = ".github/workflows/pages.yml") {
  return validatePagesWorkflow(await readFile(path, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await validatePagesWorkflowFile();
  console.log("GitHub Pages workflow contract passed.");
}
