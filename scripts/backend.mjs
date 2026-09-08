import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const apiRoot = join(root, "services", "api");
const composeFile = join(root, "compose.yaml");
const localPostgresVolume = "electro-tutor-local-postgres";
const localRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor";
const localMigrationUrl =
  "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:55432/electro_tutor";
const localTestRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor_test";
const localTestMigrationUrl =
  "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:55432/electro_tutor_test";
const localTestProvisioningUrl =
  "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@127.0.0.1:55432/electro_tutor_test";
const diagnosticTimeoutMs = 5_000;

export const backendCommands = {
  bootstrap: "restore the locked Python environment and check prerequisites",
  build: "build the local API image",
  check: "run the complete local CI-equivalent backend gate",
  dev: "migrate and start API plus PostgreSQL",
  stop: "stop local services without deleting data",
  logs: "show redacted local service logs",
  status: "show local service state",
  doctor: "check toolchain, config, database, and schema readiness",
  smoke: "call live and ready endpoints through the real API",
  "idp:provision": "reconcile local DEV Keycloak realm, client, and acceptance user",
  "idp:dev": "start local Keycloak and provision Tutor DEV identity",
  "idp:cleanup": "delete only the managed synthetic Tutor DEV identity",
  "test-fast": "run isolated backend unit/component tests",
  "test-integration": "run real PostgreSQL integration and migration tests",
  "db-status": "show Alembic status and drift",
  "db-migrate": "upgrade the local database to Alembic head",
  "db-reset-local": "delete only the named local PostgreSQL volume after confirmation",
};

function executable(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

async function run(command, args, { cwd = root, env = {}, quiet = false } = {}) {
  if (!quiet) console.log(`> ${command} ${args.join(" ")}`);
  const code = await new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: quiet ? "ignore" : "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", accept);
  });
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}`);
}

const uv = (args, options) => run(executable("uv"), args, options);
const docker = (args, options) => run(executable("docker"), args, options);
export function validateLocalNetwork(environment = process.env) {
  const postgresHost = environment.ET_POSTGRES_BIND_HOST ?? "127.0.0.1";
  if (postgresHost !== "127.0.0.1") {
    throw new Error(
      `Refusing PostgreSQL bind ${postgresHost}. ET-09.2 local services must remain on 127.0.0.1.`,
    );
  }
}

const compose = (args, options) => {
  validateLocalNetwork();
  return docker(["compose", "-f", composeFile, ...args], options);
};

export function backendEnv(environment = "local") {
  return {
    ET_ENVIRONMENT: environment,
    ET_HOST: "127.0.0.1",
    ET_PORT: "8000",
    ET_DOCS_ENABLED: environment === "local" ? "true" : "false",
    ET_DATABASE_URL: localRuntimeUrl,
    ET_MIGRATION_DATABASE_URL: localMigrationUrl,
  };
}

async function bootstrap() {
  await run(executable("node"), ["--version"]);
  await uv(["--version"]);
  await docker(["--version"]);
  await docker(["compose", "version"]);
  await uv(["sync", "--project", apiRoot, "--frozen", "--all-groups"]);
}

async function dependencyAudit() {
  await uv(["lock", "--project", apiRoot, "--check"]);
  const directory = await mkdtemp(join(tmpdir(), "electro-tutor-audit-"));
  const requirements = join(directory, "requirements.txt");
  try {
    await uv([
      "export",
      "--project",
      apiRoot,
      "--locked",
      "--no-dev",
      "--no-emit-project",
      "--output-file",
      requirements,
    ]);
    await uv(["run", "--project", apiRoot, "pip-audit", "-r", requirements]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function testFast() {
  await uv(["run", "--project", apiRoot, "ruff", "format", "--check", "src", "tests"], { cwd: apiRoot });
  await uv(["run", "--project", apiRoot, "ruff", "check", "src", "tests"], { cwd: apiRoot });
  await uv(["run", "--project", apiRoot, "mypy", "src"], { cwd: apiRoot });
  await uv([
    "run",
    "--project",
    apiRoot,
    "pytest",
    "-q",
    "-m",
    "not integration",
  ], { cwd: apiRoot });
}

async function startPostgres() {
  await compose(["up", "-d", "--wait", "postgres"]);
}

async function reconcileDatabaseRoles() {
  await compose(["run", "--rm", "db-role-bootstrap"]);
}

async function dbMigrate() {
  await startPostgres();
  await reconcileDatabaseRoles();
  await compose(["run", "--rm", "--build", "migrate"]);
}

async function dbStatus() {
  await startPostgres();
  await compose(["run", "--rm", "--build", "migrate", "python", "-m", "electro_tutor_api.cli", "db-status"]);
  await compose(["run", "--rm", "migrate", "uv", "run", "alembic", "check"]);
}

async function dev() {
  await dbMigrate();
  await compose(["up", "-d", "--wait", "api"]);
}

async function doctor() {
  await uv(["--version"]);
  await docker(["compose", "version"]);
  await uv(
    ["run", "--project", apiRoot, "python", "-m", "electro_tutor_api.cli", "doctor"],
    { cwd: apiRoot, env: backendEnv() },
  );
  const response = await fetch("http://127.0.0.1:8000/api/v1/health/ready", {
    signal: AbortSignal.timeout(diagnosticTimeoutMs),
  });
  if (response.status !== 200) throw new Error(`API readiness returned ${response.status}`);
}

async function testIntegration({ ensureServices = true } = {}) {
  if (ensureServices) await startPostgres();
  await reconcileDatabaseRoles();
  const testEnv = {
    ...backendEnv("test"),
    ET_DATABASE_URL: localTestRuntimeUrl,
    ET_TEST_DATABASE_URL: localTestRuntimeUrl,
    ET_MIGRATION_DATABASE_URL: localTestMigrationUrl,
    ET_PROVISIONING_DATABASE_URL: localTestProvisioningUrl,
    ET_CONFIRM_MIGRATION_LIFECYCLE: "electro-tutor-local",
  };
  await uv(["run", "--project", apiRoot, "alembic", "upgrade", "head"], {
    cwd: apiRoot,
    env: testEnv,
  });
  await uv(
    ["run", "--project", apiRoot, "pytest", "-q", "-m", "integration"],
    { cwd: apiRoot, env: testEnv },
  );
}

async function smoke() {
  for (const path of ["live", "ready"]) {
    const response = await fetch(`http://127.0.0.1:8000/api/v1/health/${path}`, {
      headers: { "X-Request-ID": `et09-smoke-${path}` },
      signal: AbortSignal.timeout(diagnosticTimeoutMs),
    });
    const body = await response.json();
    if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
    if (!response.headers.get("x-request-id")) throw new Error(`${path} omitted X-Request-ID`);
    if (!response.headers.get("cache-control")?.includes("no-store")) {
      throw new Error(`${path} omitted Cache-Control: no-store`);
    }
    console.log(`${path}: ${response.status} ${JSON.stringify(body)}`);
  }
}

async function idpProvision() {
  if (!process.env.ET_KEYCLOAK_ADMIN_PASSWORD || !process.env.ET_DEV_TEST_PASSWORD) {
    throw new Error("Auth DEV requires ET_KEYCLOAK_ADMIN_PASSWORD and ET_DEV_TEST_PASSWORD; secrets are never printed.");
  }
  await compose(["up", "-d", "--wait", "keycloak"]);
  await run(executable("node"), [join(root, "scripts", "keycloak-provision.mjs")], { env: { ET_KEYCLOAK_URL: "http://127.0.0.1:58081" } });
}

async function idpCleanup() {
  if (!process.env.ET_KEYCLOAK_ADMIN_PASSWORD) {
    throw new Error("Auth DEV cleanup requires ET_KEYCLOAK_ADMIN_PASSWORD; secrets are never printed.");
  }
  await compose(["up", "-d", "--wait", "keycloak"]);
  await run(executable("node"), [join(root, "scripts", "keycloak-provision.mjs"), "cleanup"], { env: { ET_KEYCLOAK_URL: "http://127.0.0.1:58081" } });
}

async function check() {
  try {
    await bootstrap();
    await dependencyAudit();
    await testFast();
    await compose(["config", "--quiet"]);
    await compose(["build", "api"]);
    await dev();
    await doctor();
    await dbStatus();
    await testIntegration({ ensureServices: false });
    await smoke();
    console.log("Backend CI-equivalent verification passed.");
  } finally {
    await compose(["down", "--remove-orphans"]);
  }
}

export async function main(operation = "help") {
  switch (operation) {
    case "help":
      for (const [name, purpose] of Object.entries(backendCommands)) console.log(`${name.padEnd(17)} ${purpose}`);
      return;
    case "bootstrap": return bootstrap();
    case "build": return compose(["build", "api"]);
    case "check": return check();
    case "dev": return dev();
    case "stop": return compose(["down", "--remove-orphans"]);
    case "logs": return compose(["logs", "--tail", "200", "api", "postgres"]);
    case "status": return compose(["ps"]);
    case "doctor": return doctor();
    case "smoke": return smoke();
    case "idp:provision": return idpProvision();
    case "idp:dev": return idpProvision();
    case "idp:cleanup": return idpCleanup();
    case "test-fast": return testFast();
    case "test-integration": return testIntegration();
    case "db-status": return dbStatus();
    case "db-migrate": return dbMigrate();
    case "db-reset-local":
      if (process.env.ET_CONFIRM_RESET_LOCAL !== "electro-tutor-local") {
        throw new Error(
          "Refusing local DB reset. Set ET_CONFIRM_RESET_LOCAL=electro-tutor-local for this disposable project volume.",
        );
      }
      await compose(["down", "--remove-orphans"]);
      return docker(["volume", "rm", localPostgresVolume]);
    default:
      throw new Error(`Unknown backend command: ${operation}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv[2]);
}
