import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const canonicalStagePath = "docs/STAGES.md";
const activeConsumers = [
  "AGENTS.md",
  "README.md",
  "specs/features/context-automation.spec.md",
  "docs/DECISIONS.md",
  "docs/CONTEXT_COMPATIBILITY.md",
  "docs/project-context.md",
];
const activeRoutingConsumers = [
  "AGENTS.md",
  "README.md",
  "specs/README.md",
  "docs/ROADMAP.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY.md",
];

const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(`Context route validation failed: ${message}`);
};

if (!existsSync(resolve(root, canonicalStagePath))) {
  fail(`${canonicalStagePath} is missing`);
}
for (const detachedPath of ["prompts/STAGES.md", "docs/AI_PLAN.md", "docs/AI_STATUS.md"]) {
  if (existsSync(resolve(root, detachedPath))) {
    fail(`${detachedPath} is still present as a competing execution source`);
  }
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

for (const path of activeRoutingConsumers) {
  const content = read(path);
  if (/\bAI_(?:PLAN|STATUS)(?:\.md)?\b/.test(content)) {
    fail(`${path} references a detached legacy routing source`);
  }
}

const stages = read(canonicalStagePath);
const stageIdMatches = [
  ...stages.matchAll(/^- Stage ID: ([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/gm),
];
if (stageIdMatches.length !== 1) {
  fail(`${canonicalStagePath} must contain exactly one Stage ID, found ${stageIdMatches.length}`);
}

const stageId = stageIdMatches[0][1];
const stageLines = stages.split(/\r?\n/);
const matchingHeadingIndexes = stageLines
  .map((line, index) => ({ line, index }))
  .filter(({ line }) => line === `## ${stageId}` || line.startsWith(`## ${stageId} —`))
  .map(({ index }) => index);
if (matchingHeadingIndexes.length !== 1) {
  fail(`${stageId} must select exactly one heading in ${canonicalStagePath}`);
}

const recordStart = matchingHeadingIndexes[0];
const nextHeadingOffset = stageLines
  .slice(recordStart + 1)
  .findIndex((line) => line.startsWith("## "));
const recordEnd = nextHeadingOffset === -1
  ? stageLines.length
  : recordStart + 1 + nextHeadingOffset;
const record = stageLines.slice(recordStart, recordEnd).join("\n");
const statusMatches = [...record.matchAll(/^- Status: ([a-z_]+)$/gm)];
const nextMatches = [...record.matchAll(/^- NEXT: ([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/gm)];
const blockerMatches = [...record.matchAll(/^- Blockers: (.+)$/gm)];

if (statusMatches.length !== 1) {
  fail(`${stageId} must contain exactly one canonical Status field`);
}
if (nextMatches.length !== 1) {
  fail(`${stageId} must contain exactly one canonical NEXT field`);
}

const status = statusMatches[0][1];
if (status === "blocked") {
  const blockers = blockerMatches.map((match) => match[1].trim());
  if (blockers.length !== 1 || blockers[0] === "none") {
    fail(`${stageId} is blocked but does not contain exactly one non-empty Blockers field`);
  }
}

const routingResult = status === "blocked" ? "blocked; stage execution denied" : status;
console.log(`Context route OK: ${stageId} (${routingResult}) -> ${canonicalStagePath}`);
