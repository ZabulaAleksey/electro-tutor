import process from "node:process";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  reconcileE2EIdentities,
  requireAuthE2ESecrets,
  runBackendCommand,
  runTrustedBookingGrantCli,
  runTrustedProfileCli,
} from "./profile-e2e-support.mjs";

requireAuthE2ESecrets(process.env, ["ET_KEYCLOAK_ADMIN_PASSWORD", "ET_DEV_TEST_PASSWORD"]);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const adminEnvironment = process.env;
const environmentWithoutSecrets = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => ![
    "ET_KEYCLOAK_ADMIN_PASSWORD",
    "ET_DEV_TEST_PASSWORD",
  ].includes(name)),
);
const browserEnvironment = {
  ...environmentWithoutSecrets,
  ET_DEV_TEST_PASSWORD: process.env.ET_DEV_TEST_PASSWORD,
  ET_E2E_DATABASE_TARGET: "test",
};
const runNode = (args, environment = environmentWithoutSecrets) => execFileSync(node, args, {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});
runNode([join(projectRoot, "scripts", "validate-locales.mjs")]);
runNode([join(projectRoot, "node_modules", "astro", "bin", "astro.mjs"), "build"]);
for (const audit of ["audit-built-locales.mjs", "audit-built-lessons.mjs", "audit-built-site.mjs"]) {
  runNode([join(projectRoot, "scripts", audit)]);
}

let acceptanceFailure;
try {
runBackendCommand("e2e-dev", environmentWithoutSecrets);
// Recreate only the two ownership-group-guarded synthetic identities. Fresh
// immutable subjects make each run independent from profiles/grants left by a
// previous run without resetting or deleting application data.
reconcileE2EIdentities(adminEnvironment);
runBackendCommand("idp:cleanup", adminEnvironment);
const identities = reconcileE2EIdentities(adminEnvironment);

const baseBrowserEnvironment = {
  ...browserEnvironment,
  E2E_PRIMARY_SUBJECT: identities.primarySubject,
  E2E_SECONDARY_SUBJECT: identities.secondarySubject,
  E2E_SPEC: "tests/e2e/auth-flow.spec.ts",
};
const runBrowserPhase = (phase, extra = {}) => runNode(
  [join(projectRoot, "scripts", "run-e2e.mjs")],
  { ...baseBrowserEnvironment, ...extra, E2E_AUTH_PHASE: phase },
);

runBrowserPhase("profiles");
runTrustedBookingGrantCli({
  subject: identities.secondarySubject,
  operationId: randomUUID(),
  correlationId: randomUUID(),
  requestId: `et-10-1d-booking-grant-${randomUUID()}`,
}, baseBrowserEnvironment);
runBrowserPhase("booking");
const accountBeforeEmailChange = runTrustedProfileCli(
  ["e2e-resolve-account", "--subject", identities.primarySubject],
  "account_resolved",
  browserEnvironment,
).account_id;

const originalEmail = process.env.ET_DEV_TEST_EMAIL || "et-dev-acceptance@invalid.example";
const changedEmail = "et-dev-acceptance-changed@invalid.example";
try {
  const changedSubjects = reconcileE2EIdentities({
    ...adminEnvironment,
    ET_DEV_TEST_EMAIL: changedEmail,
  });
  if (
    changedSubjects.primarySubject !== identities.primarySubject
    || changedSubjects.secondarySubject !== identities.secondarySubject
  ) {
    throw new Error("Keycloak immutable subjects changed during email reconciliation.");
  }
  runBrowserPhase("identity-change", { ET_DEV_TEST_EMAIL: changedEmail });
  const accountAfterEmailChange = runTrustedProfileCli(
    ["e2e-resolve-account", "--subject", identities.primarySubject],
    "account_resolved",
    browserEnvironment,
  ).account_id;
  if (accountAfterEmailChange !== accountBeforeEmailChange) {
    throw new Error("Application Account changed during provider email reconciliation.");
  }
} finally {
  reconcileE2EIdentities({ ...adminEnvironment, ET_DEV_TEST_EMAIL: originalEmail });
}
} catch (error) {
  acceptanceFailure = error;
}

try {
  runBackendCommand("stop", environmentWithoutSecrets);
} catch (cleanupError) {
  console.error("Authenticated E2E cleanup failed; run pnpm backend:stop manually.");
  if (!acceptanceFailure) acceptanceFailure = cleanupError;
}

if (acceptanceFailure) throw acceptanceFailure;
console.log("Authenticated E2E passed; local API, PostgreSQL, and Keycloak were stopped without deleting data.");
