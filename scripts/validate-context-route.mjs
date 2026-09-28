import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const canonicalStagePath = "docs/STAGES.md";
const canonicalDecisionsPath = "docs/DECISIONS.md";
const requirementLedgerPath = "docs/requirements-ledger.json";
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

const decisionIds = [
  ...read(canonicalDecisionsPath).matchAll(/^## (ADR-[0-9]{3})\b/gm),
].map((match) => match[1]);
const duplicateDecisionIds = decisionIds.filter(
  (id, index) => decisionIds.indexOf(id) !== index,
);
if (duplicateDecisionIds.length > 0) {
  fail(`${canonicalDecisionsPath} contains duplicate decision IDs: ${[
    ...new Set(duplicateDecisionIds),
  ].join(", ")}`);
}

let requirementLedger;
try {
  requirementLedger = JSON.parse(read(requirementLedgerPath));
} catch (error) {
  fail(`${requirementLedgerPath} is not valid JSON: ${error.message}`);
}
const allowedLedgerStatuses = new Set([
  "VERIFIED",
  "IMPLEMENTED",
  "PARTIAL",
  "PLANNED",
  "BLOCKED",
  "UNAVAILABLE",
]);
const ledgerArrayFields = ["requirement_ids", "code", "unit", "integration", "e2e"];
const ledgerTextFields = [
  "domain",
  "runtime",
  "security",
  "a11y",
  "observability",
  "gap",
  "action",
];
const requirementIdPrefixes = [
  "ET10.2-AC",
  "ET10.3-AC",
  "AC-ET091",
  "AC-ET092",
  "ACCESS-SEC",
  "PCA-PROFILE",
  "PCA-GRANT",
  "PCA-AUDIT",
  "PCA-ID",
  "FR-CTX",
  "NFR-CTX",
  "AC-CTX",
  "AC-RTC",
  "AC-QG",
  "LP-FR",
  "LP-NFR",
  "LP-AC",
  "CDS-FR",
  "CDS-NFR",
  "CDS-AC",
  "L10N",
  "BASE",
  "AUTHZ",
  "ACCESS",
  "SESSION",
  "PAYOUT",
  "NOTIF",
  "BOARD",
  "BOOK",
  "PLAT",
  "AUTH",
  "TIME",
  "CHAT",
  "REC",
  "PAY",
  "AI",
  "INT",
  "LINE",
  "OPS",
  "DB",
  "RTC",
  "QG",
  "NFR",
  "FR",
  "AC",
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const requirementTokenPattern = new RegExp(
  `\\b(${requirementIdPrefixes.map(escapeRegExp).join("|")})-`
  + "([0-9]{2,3}|[A-Z])([a-z]?)(?:\\.\\.([0-9]{2,3}|[A-Z])([a-z]?))?\\b",
  "g",
);
const specFiles = readdirSync(resolve(root, "specs"), {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.md"))
  .map((entry) => resolve(entry.parentPath, entry.name));
const specRequirementIds = new Set();
for (const specFile of specFiles) {
  const addRequirementId = (requirementId) => {
    specRequirementIds.add(requirementId);
  };
  for (const match of readFileSync(specFile, "utf8").matchAll(requirementTokenPattern)) {
    const [, prefix, first, firstSuffix, last] = match;
    if (!last) {
      addRequirementId(`${prefix}-${first}${firstSuffix}`);
      continue;
    }
    if (/^\d+$/.test(first) && /^\d+$/.test(last)) {
      for (let value = Number(first); value <= Number(last); value += 1) {
        addRequirementId(`${prefix}-${String(value).padStart(first.length, "0")}`);
      }
      continue;
    }
    if (/^[A-Z]$/.test(first) && /^[A-Z]$/.test(last)) {
      for (let value = first.charCodeAt(0); value <= last.charCodeAt(0); value += 1) {
        addRequirementId(`${prefix}-${String.fromCharCode(value)}`);
      }
    }
  }
}
if (
  requirementLedger?.schema_version !== 1
  || !Array.isArray(requirementLedger.rows)
  || requirementLedger.rows.length === 0
  || requirementLedger.coverage_scope?.denominator !== "all_stable_requirements"
  || !Array.isArray(requirementLedger.coverage_scope?.binding_spec_files)
  || !Array.isArray(requirementLedger.coverage_scope?.mixed_spec_files)
  || !Array.isArray(requirementLedger.coverage_scope?.backlog_spec_files)
  || !Array.isArray(requirementLedger.coverage_scope?.architecture_baseline_requirement_ids)
  || !Array.isArray(requirementLedger.coverage_scope?.future_backlog_requirement_ids)
) {
  fail(`${requirementLedgerPath} must contain non-empty schema v1 rows and classified coverage scope`);
}
const classifiedSpecFiles = new Set([
  ...requirementLedger.coverage_scope.binding_spec_files,
  ...requirementLedger.coverage_scope.mixed_spec_files,
  ...requirementLedger.coverage_scope.backlog_spec_files,
]);
const relativeSpecFiles = specFiles
  .map((specFile) => specFile.slice(root.length + 1).replaceAll("\\", "/"))
  .sort();
const allClassifiedSpecFiles = [
  ...requirementLedger.coverage_scope.binding_spec_files,
  ...requirementLedger.coverage_scope.mixed_spec_files,
  ...requirementLedger.coverage_scope.backlog_spec_files,
];
const duplicateClassifiedSpecFiles = allClassifiedSpecFiles
  .filter((specFile, index) => allClassifiedSpecFiles.indexOf(specFile) !== index);
if (
  duplicateClassifiedSpecFiles.length > 0
  || relativeSpecFiles.some((specFile) => !classifiedSpecFiles.has(specFile))
  || [...classifiedSpecFiles].some((specFile) => !relativeSpecFiles.includes(specFile))
) {
  fail(`${requirementLedgerPath} must classify every SPEC exactly once as binding, mixed or backlog`);
}
const seenRequirementIds = new Set();
const requirementStatusById = new Map();
for (const [index, row] of requirementLedger.rows.entries()) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    fail(`${requirementLedgerPath} row ${index} must be an object`);
  }
  if (!allowedLedgerStatuses.has(row.status)) {
    fail(`${requirementLedgerPath} row ${index} has unsupported status ${row.status}`);
  }
  for (const field of ledgerArrayFields) {
    if (!Array.isArray(row[field]) || (field === "requirement_ids" && row[field].length === 0)) {
      fail(`${requirementLedgerPath} row ${index} field ${field} must be an array`);
    }
  }
  for (const field of ledgerTextFields) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      fail(`${requirementLedgerPath} row ${index} field ${field} must be non-empty text`);
    }
  }
  if (
    row.status === "VERIFIED"
    && ["code", "unit", "integration", "e2e"].some((field) => row[field].length === 0)
  ) {
    fail(`${requirementLedgerPath} row ${index} is VERIFIED without code/unit/integration/e2e evidence`);
  }
  for (const requirementId of row.requirement_ids) {
    if (typeof requirementId !== "string" || !/^[A-Z][A-Za-z0-9.-]*$/.test(requirementId)) {
      fail(`${requirementLedgerPath} row ${index} has invalid requirement ID ${requirementId}`);
    }
    if (seenRequirementIds.has(requirementId)) {
      fail(`${requirementLedgerPath} repeats requirement ID ${requirementId}`);
    }
    seenRequirementIds.add(requirementId);
    requirementStatusById.set(requirementId, row.status);
  }
}
const missingRequirementIds = [...specRequirementIds]
  .filter((requirementId) => !seenRequirementIds.has(requirementId))
  .sort();
const unknownRequirementIds = [...seenRequirementIds]
  .filter((requirementId) => !specRequirementIds.has(requirementId))
  .sort();
if (missingRequirementIds.length > 0 || unknownRequirementIds.length > 0) {
  fail(
    `${requirementLedgerPath} does not match the SPEC corpus; missing: ${missingRequirementIds.join(", ") || "none"}; unknown: ${unknownRequirementIds.join(", ") || "none"}`,
  );
}
const architectureBaselineRequirementIds = new Set(
  requirementLedger.coverage_scope.architecture_baseline_requirement_ids,
);
const futureBacklogRequirementIds = new Set(
  requirementLedger.coverage_scope.future_backlog_requirement_ids,
);
const duplicatedMixedRequirementIds = [...architectureBaselineRequirementIds]
  .filter((requirementId) => futureBacklogRequirementIds.has(requirementId));
const invalidMixedRequirementIds = [
  ...architectureBaselineRequirementIds,
  ...futureBacklogRequirementIds,
].filter((requirementId) => !specRequirementIds.has(requirementId));
if (
  duplicatedMixedRequirementIds.length > 0
  || invalidMixedRequirementIds.length > 0
) {
  fail(
    `${requirementLedgerPath} has invalid per-ID scope classification; duplicated: ${duplicatedMixedRequirementIds.join(", ") || "none"}; invalid: ${invalidMixedRequirementIds.join(", ") || "none"}`,
  );
}
const allowedFutureBacklogStatuses = new Set(["PLANNED", "BLOCKED", "UNAVAILABLE"]);
const promotedFutureBacklogIds = [...futureBacklogRequirementIds]
  .filter((requirementId) => !allowedFutureBacklogStatuses.has(requirementStatusById.get(requirementId)));
if (promotedFutureBacklogIds.length > 0) {
  fail(`${requirementLedgerPath} promotes future backlog IDs without a binding SPEC: ${promotedFutureBacklogIds.join(", ")}`);
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
