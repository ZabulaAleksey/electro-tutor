import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const canonicalStagePath = "prompts/STAGES.md";
const activeConsumers = [
  "AGENTS.md",
  "README.md",
  "specs/features/context-automation.spec.md",
  "docs/DECISIONS.md",
  "docs/CONTEXT_COMPATIBILITY.md",
  "docs/project-context.md",
];

const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(`Context route validation failed: ${message}`);
};

if (!existsSync(resolve(root, canonicalStagePath))) {
  fail(`${canonicalStagePath} is missing`);
}

for (const path of activeConsumers) {
  if (read(path).includes("STAGED_PROMPTS.md")) {
    fail(`${path} references the removed legacy stage file`);
  }
}

for (const path of ["AGENTS.md", "README.md", "specs/features/context-automation.spec.md"]) {
  if (!read(path).includes(canonicalStagePath)) {
    fail(`${path} does not reference ${canonicalStagePath}`);
  }
}

const plan = read("docs/AI_PLAN.md");
const stageIdMatches = [...plan.matchAll(/^- Stage ID: `([^`]+)`$/gm)];
if (stageIdMatches.length !== 1) {
  fail(`AI_PLAN must contain exactly one Stage ID, found ${stageIdMatches.length}`);
}

const stageId = stageIdMatches[0][1];
const matchingHeadings = read(canonicalStagePath)
  .split(/\r?\n/)
  .filter((line) => line === `## ${stageId}` || line.startsWith(`## ${stageId} —`));
if (matchingHeadings.length !== 1) {
  fail(`${stageId} must select exactly one heading in ${canonicalStagePath}`);
}

console.log(`Context route OK: ${stageId} -> ${canonicalStagePath}`);
