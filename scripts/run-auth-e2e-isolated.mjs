import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseProvisionerSummary, runTrustedBookingGrantCli } from "./profile-e2e-support.mjs";

const root = resolve(import.meta.dirname, "..");
const apiRoot = join(root, "services", "api");
const python = join(apiRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const port = process.env.ET_TEST_POSTGRES_PORT;
if (process.env.BACKEND_CLONE_CONTAINER !== "electro-tutor-et103-test-20260926"
  || port !== "55434" || !process.env.ET_KEYCLOAK_ADMIN_PASSWORD
  || !process.env.ET_DEV_TEST_PASSWORD) {
  throw new Error("Isolated auth phase requires the exact disposable test DB and ephemeral IdP credentials.");
}
const baseEnvironment = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !key.startsWith("ET_") && !key.startsWith("E2E_")
    && !key.startsWith("KC_") && key !== "BACKEND_CLONE_CONTAINER"));
const database = "electro_tutor_test";
const roleUrl = (role, password) =>
  `postgresql+asyncpg://electro_tutor_${role}:${password}@127.0.0.1:${port}/${database}`;
const databaseEnvironment = {
  ...baseEnvironment,
  ET_ENVIRONMENT: "test",
  ET_HOST: "127.0.0.1",
  ET_PORT: "8000",
  ET_DOCS_ENABLED: "false",
  ET_DATABASE_URL: roleUrl("runtime", "local-runtime-only"),
  ET_AUTH_DATABASE_URL: roleUrl("auth_runtime", "local-auth-runtime-only"),
  ET_MIGRATION_DATABASE_URL: roleUrl("migrator", "local-migration-only"),
};

function command(file, args, options = {}) {
  try {
    return execFileSync(file, args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000, ...options,
    });
  } catch (error) {
    throw new Error(`Isolated auth subprocess failed (exit ${error.status ?? "unknown"}); child output redacted.`);
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return;
    } catch { /* Wait for the exact local service. */ }
    finally { clearTimeout(timeout); }
    await delay(500);
  }
  throw new Error(`Isolated service did not become ready: ${url}`);
}

function browserPhase(phase, identities) {
  const env = {
    ...baseEnvironment,
    ET_DEV_TEST_PASSWORD: process.env.ET_DEV_TEST_PASSWORD,
    ET_TEST_POSTGRES_PORT: port,
    ET_E2E_DATABASE_TARGET: "test",
    E2E_PRIMARY_SUBJECT: identities.primarySubject,
    E2E_SECONDARY_SUBJECT: identities.secondarySubject,
    E2E_THIRD_SUBJECT: identities.thirdSubject,
    E2E_AUTH_PHASE: phase,
    E2E_SPEC: phase === "lesson-session"
      ? "tests/e2e/auth-lesson-session.spec.ts"
      : "tests/e2e/auth-flow.spec.ts",
  };
  execFileSync(process.execPath, [join(root, "scripts", "run-e2e.mjs")], {
    cwd: root, env, stdio: "inherit", timeout: phase === "lesson-session" ? 600_000 : 300_000,
  });
  return env;
}

let api;
try {
  await waitFor("http://127.0.0.1:58081/realms/master", 300_000);
  command(python, ["-m", "alembic", "upgrade", "head"], { cwd: apiRoot, env: databaseEnvironment });
  command(python, ["-m", "alembic", "check"], { cwd: apiRoot, env: databaseEnvironment });
  const provisionEnvironment = {
    ...baseEnvironment,
    ET_KEYCLOAK_ADMIN_PASSWORD: process.env.ET_KEYCLOAK_ADMIN_PASSWORD,
    ET_DEV_TEST_PASSWORD: process.env.ET_DEV_TEST_PASSWORD,
    ET_KEYCLOAK_URL: "http://127.0.0.1:58081",
  };
  const identities = parseProvisionerSummary(command(process.execPath,
    [join(root, "scripts", "keycloak-provision.mjs")], { env: provisionEnvironment }));
  api = spawn(python, ["-m", "uvicorn", "electro_tutor_api.main:create_app", "--factory",
    "--host", "127.0.0.1", "--port", "8000", "--no-access-log"], {
    cwd: apiRoot, env: databaseEnvironment, stdio: "ignore", shell: false,
  });
  await waitFor("http://127.0.0.1:8000/api/v1/health/ready", 30_000);
  await waitFor("http://127.0.0.1:8000/api/v1/health/live", 5_000);
  console.log("Isolated live auth: PostgreSQL 55434, Keycloak 58081, API 8000, web 4322; /live and /ready PASS.");
  const browserEnvironment = browserPhase("profiles", identities);
  runTrustedBookingGrantCli({
    subject: identities.secondarySubject,
    operationId: randomUUID(),
    correlationId: randomUUID(),
    requestId: `et-10-3-isolated-grant-${randomUUID()}`,
  }, browserEnvironment);
  browserPhase("lesson-session", identities);
  console.log("Isolated authenticated Session E2E PASS.");
} finally {
  if (api && api.exitCode === null) {
    const waitForExit = async (timeoutMs) => {
      if (api.exitCode !== null || api.signalCode !== null) return true;
      return Promise.race([
        new Promise((done) => api.once("exit", () => done(true))),
        delay(timeoutMs, false),
      ]);
    };
    api.kill("SIGTERM");
    if (!await waitForExit(5000)) {
      api.kill("SIGKILL");
      if (!await waitForExit(2000)) {
        process.exitCode = 1;
        console.error("Isolated API process did not stop after bounded termination.");
      }
    }
  }
}
