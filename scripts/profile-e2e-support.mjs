import { execFileSync } from "node:child_process";
import process from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const managedIdentities = ["et-dev-acceptance", "et-dev-acceptance-b", "et-dev-acceptance-c"];
const requiredSecrets = ["ET_KEYCLOAK_ADMIN_PASSWORD", "ET_DEV_TEST_PASSWORD"];

const localRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor";
const localTestRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor_test";
const localAuthUrl =
  "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@127.0.0.1:55432/electro_tutor";
const localTestAuthUrl =
  "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@127.0.0.1:55432/electro_tutor_test";
const localProvisioningUrl =
  "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@127.0.0.1:55432/electro_tutor";
const localTestProvisioningUrl =
  "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@127.0.0.1:55432/electro_tutor_test";

function parseJsonLines(output) {
  return String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function runCaptured(executable, args, { env = process.env, label, timeout = 300_000 } = {}) {
  try {
    return execFileSync(executable, args, {
      cwd: projectRoot,
      encoding: "utf8",
      env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });
  } catch (error) {
    const exitCode = typeof error?.status === "number" ? ` (exit ${error.status})` : "";
    throw new Error(`${label ?? "E2E command"} failed${exitCode}; output was redacted.`);
  }
}

export function requireAuthE2ESecrets(environment = process.env, names = requiredSecrets) {
  const missing = names.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`${missing.join(" and ")} required for real authenticated browser acceptance; secrets are never printed.`);
  }
}

export function parseProvisionerSummary(output) {
  const summaries = parseJsonLines(output).filter((value) => Array.isArray(value?.testIdentities));
  if (summaries.length !== 1) {
    throw new Error("Keycloak provisioner did not emit exactly one safe identity summary.");
  }
  const identities = summaries[0].testIdentities;
  if (identities.length !== managedIdentities.length) {
    throw new Error("Keycloak provisioner safe identity summary has an unexpected identity count.");
  }
  const subjects = new Map();
  for (const identity of identities) {
    if (!managedIdentities.includes(identity?.name) || !uuidPattern.test(identity?.subject ?? "")) {
      throw new Error("Keycloak provisioner safe identity summary is invalid.");
    }
    if (subjects.has(identity.name)) {
      throw new Error("Keycloak provisioner safe identity summary contains a duplicate identity.");
    }
    subjects.set(identity.name, identity.subject);
  }
  if (subjects.size !== managedIdentities.length) {
    throw new Error("Keycloak provisioner safe identity summary is incomplete.");
  }
  return {
    primarySubject: subjects.get(managedIdentities[0]),
    secondarySubject: subjects.get(managedIdentities[1]),
    thirdSubject: subjects.get(managedIdentities[2]),
  };
}

export function parseTrustedCliSummary(output, expectedOperation) {
  const summaries = parseJsonLines(output).filter((value) => value?.status === "ok");
  if (summaries.length !== 1 || summaries[0].operation !== expectedOperation) {
    throw new Error("Trusted profile E2E CLI did not emit the expected safe summary.");
  }
  const summary = summaries[0];
  const uuidFields = {
    account_resolved: ["account_id"],
    tutor_grant_issued: ["account_id", "grant_id", "correlation_id", "operation_id"],
    booking_grant_issued: ["account_id", "grant_id", "correlation_id", "operation_id"],
    audit_verified: ["account_id", "event_id", "correlation_id", "operation_id"],
  }[expectedOperation];
  if (!uuidFields || uuidFields.some((field) => !uuidPattern.test(summary[field] ?? ""))) {
    throw new Error("Trusted profile E2E CLI safe summary contains an invalid identifier.");
  }
  return summary;
}

export function trustedCliEnvironment(environment = process.env) {
  const cleanEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([name]) => !name.startsWith("ET_")),
  );
  const useTestDatabase = environment.ET_E2E_DATABASE_TARGET === "test";
  return {
    ...cleanEnvironment,
    ET_ENVIRONMENT: useTestDatabase ? "test" : "local",
    ET_HOST: "127.0.0.1",
    ET_PORT: "8000",
    ET_DOCS_ENABLED: useTestDatabase ? "false" : "true",
    ET_DATABASE_URL: useTestDatabase ? localTestRuntimeUrl : localRuntimeUrl,
    ET_AUTH_DATABASE_URL: useTestDatabase ? localTestAuthUrl : localAuthUrl,
    ET_PROVISIONING_DATABASE_URL: useTestDatabase
      ? localTestProvisioningUrl
      : localProvisioningUrl,
    ET_OIDC_ISSUER: "http://127.0.0.1:58081/realms/electro-tutor-dev",
    ET_OIDC_BACKCHANNEL_BASE_URL: "http://127.0.0.1:58081",
    ET_OIDC_CLIENT_ID: "electro-tutor-web-dev",
    ET_OIDC_REDIRECT_URI: "http://127.0.0.1:8000/api/v1/auth/callback",
    ET_OIDC_ALLOWED_RETURN_URLS: [
      "http://127.0.0.1:4321/ru/account/",
      "http://127.0.0.1:4321/uk/account/",
      "http://127.0.0.1:4322/ru/account/",
      "http://127.0.0.1:4322/uk/account/",
    ].join(","),
    ET_OIDC_ALLOWED_POST_LOGOUT_URLS: "http://127.0.0.1:4321/,http://127.0.0.1:4322/",
    ET_WEB_ORIGINS: "http://127.0.0.1:4321,http://127.0.0.1:4322",
    ET_COOKIE_SECURE: "false",
  };
}

export function runBackendCommand(operation, environment = process.env) {
  return runCaptured(process.execPath, [join(projectRoot, "scripts", "backend.mjs"), operation], {
    env: environment,
    label: `backend ${operation}`,
  });
}

export function reconcileE2EIdentities(environment = process.env) {
  requireAuthE2ESecrets(environment);
  return parseProvisionerSummary(runBackendCommand("idp:e2e", environment));
}

export function runTrustedProfileCli(args, expectedOperation, environment = process.env) {
  const executable = process.platform === "win32" ? "uv.exe" : "uv";
  const privileged = expectedOperation === "tutor_grant_issued"
    || expectedOperation === "booking_grant_issued"
    || expectedOperation === "audit_verified";
  const managedSubjects = [environment.E2E_PRIMARY_SUBJECT, environment.E2E_SECONDARY_SUBJECT];
  if (privileged && managedSubjects.some((subject) => !uuidPattern.test(subject ?? ""))) {
    throw new Error("Trusted profile E2E CLI requires both managed subjects.");
  }
  const managedArgs = privileged
    ? managedSubjects.flatMap((subject) => ["--managed-subject", subject])
    : [];
  const output = runCaptured(
    executable,
    [
      "run",
      "--project",
      join(projectRoot, "services", "api"),
      "python",
      "-m",
      "electro_tutor_api.cli",
      ...args,
      ...managedArgs,
    ],
    {
      env: trustedCliEnvironment(environment),
      label: "trusted profile E2E CLI",
      timeout: 120_000,
    },
  );
  return parseTrustedCliSummary(output, expectedOperation);
}

export function runTrustedBookingGrantCli(
  { subject, operationId, correlationId, requestId },
  environment = process.env,
) {
  return runTrustedProfileCli([
    "e2e-issue-booking-grant",
    "--subject", subject,
    "--operation-id", operationId,
    "--correlation-id", correlationId,
    "--request-id", requestId,
  ], "booking_grant_issued", environment);
}

export function isCanonicalUuid(value) {
  return uuidPattern.test(value ?? "");
}
