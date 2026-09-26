import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createServer } from "node:net";

const root = resolve(import.meta.dirname, "..");
const apiRoot = join(root, "services", "api");
const composeFile = join(root, "compose.yaml");
const e2eComposeFile = join(root, "compose.e2e.yaml");
const localPostgresVolume = "electro-tutor-local-postgres";
const localRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor";
const localMigrationUrl =
  "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:55432/electro_tutor";
const localAuthUrl =
  "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@127.0.0.1:55432/electro_tutor";
const localTestRuntimeUrl =
  "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@127.0.0.1:55432/electro_tutor_test";
const localTestMigrationUrl =
  "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@127.0.0.1:55432/electro_tutor_test";
const localTestAuthUrl =
  "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@127.0.0.1:55432/electro_tutor_test";
const localTestProvisioningUrl =
  "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@127.0.0.1:55432/electro_tutor_test";
const catalogBaselineName = "electro_tutor_catalog_baseline";
const localCatalogMigrationUrl = localMigrationUrl.replace(/\/electro_tutor$/, `/${catalogBaselineName}`);
const catalogManifestPath = join(apiRoot, "src", "electro_tutor_api", "schema_catalog_manifest.json");
const diagnosticTimeoutMs = 5_000;

export const backendCommands = {
  bootstrap: "restore the locked Python environment and check prerequisites",
  build: "build the local API image",
  check: "run the complete local CI-equivalent backend gate",
  dev: "migrate and start API plus PostgreSQL",
  "e2e-dev": "migrate and start API against the isolated local test database",
  stop: "stop local services without deleting data",
  logs: "show redacted local service logs",
  status: "show local service state",
  doctor: "check toolchain, config, database, and schema readiness",
  smoke: "call live and ready endpoints through the real API",
  "idp:provision": "reconcile local DEV Keycloak realm, client, and acceptance identities",
  "idp:dev": "start local Keycloak and provision Tutor DEV identities",
  "idp:e2e": "provision three managed E2E identities and emit their safe subjects",
  "idp:cleanup": "delete only the three managed synthetic Tutor DEV identities",
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

async function runCaptured(command, args, { cwd = root, env = {} } = {}) {
  const result = await new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 2_000_000) child.kill();
    });
    child.stderr.resume();
    child.once("error", reject);
    child.once("exit", (code) => accept({ code, output }));
  });
  if (result.code !== 0 || result.output.length > 2_000_000) {
    throw new Error("Catalog baseline snapshot failed; child output was redacted.");
  }
  try {
    return JSON.parse(result.output);
  } catch {
    throw new Error("Catalog baseline emitted invalid JSON; child output was redacted.");
  }
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

const e2eCompose = (args, options) => {
  validateLocalNetwork();
  return docker(["compose", "-f", composeFile, "-f", e2eComposeFile, ...args], options);
};

export function backendEnv(environment = "local") {
  return {
    ET_ENVIRONMENT: environment,
    ET_HOST: "127.0.0.1",
    ET_PORT: "8000",
    ET_DOCS_ENABLED: environment === "local" ? "true" : "false",
    ET_DATABASE_URL: localRuntimeUrl,
    ET_AUTH_DATABASE_URL: localAuthUrl,
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
    ], { quiet: true });
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
    "not integration and not catalog_baseline",
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

async function catalogBaseline(mode = "check") {
  if (!new Set(["check", "refresh", "test"]).has(mode)) {
    throw new Error("Catalog baseline mode must be check, refresh, or test.");
  }
  await startPostgres();
  await reconcileDatabaseRoles();
  const psql = (database, sql) => compose([
    "exec", "-T", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "electro_tutor_bootstrap", "-d", database, "-c", sql,
  ]);
  let created = false;
  try {
    // CREATE fails if this exact name already exists; never overwrite or drop it.
    await psql("postgres", `CREATE DATABASE ${catalogBaselineName} OWNER electro_tutor_migrator`);
    created = true;
    await psql(catalogBaselineName,
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC; " +
      "GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator; " +
      "GRANT USAGE ON SCHEMA public TO electro_tutor_runtime, " +
      "electro_tutor_auth_runtime, electro_tutor_provisioner");
    const baselineEnv = {
      ...backendEnv("test"),
      ET_MIGRATION_DATABASE_URL: localCatalogMigrationUrl,
    };
    await uv(["run", "--project", apiRoot, "alembic", "upgrade", "head"], {
      cwd: apiRoot, env: baselineEnv,
    });
    await uv(["run", "--project", apiRoot, "alembic", "check"], {
      cwd: apiRoot, env: baselineEnv,
    });
    const snapshot = await runCaptured(executable("uv"), [
      "run", "--project", apiRoot, "python", "-m", "electro_tutor_api.cli",
      "db-catalog-snapshot", "--baseline-consent", "electro-tutor-catalog-baseline",
    ], { cwd: apiRoot, env: baselineEnv });
    if (snapshot.schema_version !== 1 || !snapshot.objects || !snapshot.revision) {
      throw new Error("Catalog baseline snapshot shape is invalid.");
    }
    if (mode === "test") {
      await uv(["run", "--project", apiRoot, "pytest", "-q", "-m", "catalog_baseline"], {
        cwd: apiRoot, env: baselineEnv,
      });
    }
    if (mode === "refresh") {
      await writeFile(catalogManifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      console.log("Versioned catalog manifest refreshed from a new disposable migrated DB; review its diff.");
    } else {
      const expected = JSON.parse(await readFile(catalogManifestPath, "utf8"));
      if (!isDeepStrictEqual(snapshot, expected)) {
        throw new Error("Catalog manifest differs from newly migrated disposable baseline.");
      }
      console.log("Catalog manifest parity passed against a new disposable migrated DB.");
    }
  } finally {
    if (created) {
      // Only drop the exact database created by this invocation; no FORCE.
      await psql("postgres", `DROP DATABASE ${catalogBaselineName}`);
    }
  }
}

async function dev() {
  await dbMigrate();
  await compose(["up", "-d", "--wait", "api"]);
}

async function e2eDev() {
  await startPostgres();
  await reconcileDatabaseRoles();
  await e2eCompose(["run", "--rm", "--build", "migrate"]);
  await e2eCompose(["up", "-d", "--wait", "api"]);
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

async function testIntegration({ ensureServices = true, isolatedEnv } = {}) {
  if (ensureServices) await startPostgres();
  if (!isolatedEnv) await reconcileDatabaseRoles();
  const testEnv = isolatedEnv ?? {
    ...backendEnv("test"),
    ET_DATABASE_URL: localTestRuntimeUrl,
    ET_AUTH_DATABASE_URL: localTestAuthUrl,
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

function cloneTestEnv(port) {
  const atPort = (url) => url.replace("127.0.0.1:55432/", `127.0.0.1:${port}/`);
  return {
    ...backendEnv("test"),
    ET_DATABASE_URL: atPort(localTestRuntimeUrl),
    ET_AUTH_DATABASE_URL: atPort(localTestAuthUrl),
    ET_TEST_DATABASE_URL: atPort(localTestRuntimeUrl),
    ET_MIGRATION_DATABASE_URL: atPort(localTestMigrationUrl),
    ET_PROVISIONING_DATABASE_URL: atPort(localTestProvisioningUrl),
    ET_TEST_POSTGRES_PORT: String(port),
    ET_CONFIRM_MIGRATION_LIFECYCLE: "electro-tutor-local",
  };
}

async function inspectIsolatedClone() {
  const name = process.env.BACKEND_CLONE_CONTAINER;
  const port = Number(process.env.ET_TEST_POSTGRES_PORT);
  if (!/^electro-tutor-et103-(?:clone|test)-[0-9]{8}$/.test(name ?? "")
      || !Number.isInteger(port) || port < 1 || port > 65535 || port === 55432) {
    throw new Error("Clone check requires a named ET-10.3 disposable clone and a non-55432 test port.");
  }
  const details = await runCaptured(executable("docker"), ["inspect", name]);
  const clone = details[0];
  const bindings = clone?.NetworkSettings?.Ports?.["5432/tcp"];
  const dataMounts = clone?.Mounts?.filter((mount) => mount.Destination === "/var/lib/postgresql/data");
  const otherMounts = clone?.Mounts?.filter((mount) => mount.Destination !== "/var/lib/postgresql/data");
  const approvedInitMount = otherMounts?.length === 0 || (otherMounts?.length === 1
    && otherMounts[0].Type === "bind" && !otherMounts[0].RW
    && otherMounts[0].Destination === "/docker-entrypoint-initdb.d/001-init.sql");
  if (details.length !== 1 || !clone.State?.Running || clone.Config?.Image !== "postgres:17.6"
      || dataMounts?.length !== 1 || dataMounts[0].Type !== "volume"
      || !dataMounts[0].RW || dataMounts[0].Name !== name || !approvedInitMount
      || bindings?.length !== 1 || bindings[0].HostIp !== "127.0.0.1"
      || Number(bindings[0].HostPort) !== port) {
    throw new Error("Clone check refused: container mount, state, or loopback binding differs from the disposable contract.");
  }
  await docker(["exec", name, "pg_isready", "-U", "electro_tutor_bootstrap", "-d", "electro_tutor_test"]);
  return { name, port, env: cloneTestEnv(port) };
}

async function cloneCatalogBaseline({ name, env }) {
  const database = catalogBaselineName;
  const psql = (target, sql) => docker(["exec", name, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "electro_tutor_bootstrap", "-d", target, "-c", sql]);
  let created = false;
  try {
    await psql("postgres", `CREATE DATABASE ${database} OWNER electro_tutor_migrator`);
    created = true;
    await psql(database, "REVOKE CREATE ON SCHEMA public FROM PUBLIC; " +
      "GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator; " +
      "GRANT USAGE ON SCHEMA public TO electro_tutor_runtime, " +
      "electro_tutor_auth_runtime, electro_tutor_provisioner");
    const baselineEnv = {
      ...env,
      ET_MIGRATION_DATABASE_URL: env.ET_MIGRATION_DATABASE_URL.replace(/\/electro_tutor_test$/, `/${database}`),
    };
    await uv(["run", "--project", apiRoot, "alembic", "upgrade", "head"], { cwd: apiRoot, env: baselineEnv });
    await uv(["run", "--project", apiRoot, "alembic", "check"], { cwd: apiRoot, env: baselineEnv });
    const snapshot = await runCaptured(executable("uv"), ["run", "--project", apiRoot,
      "python", "-m", "electro_tutor_api.cli", "db-catalog-snapshot",
      "--baseline-consent", "electro-tutor-catalog-baseline"], { cwd: apiRoot, env: baselineEnv });
    const expected = JSON.parse(await readFile(catalogManifestPath, "utf8"));
    if (!isDeepStrictEqual(snapshot, expected)) {
      throw new Error("Clone baseline differs from the versioned catalog manifest.");
    }
    await uv(["run", "--project", apiRoot, "pytest", "-q", "-m", "catalog_baseline"], {
      cwd: apiRoot, env: baselineEnv,
    });
  } finally {
    if (created) await psql("postgres", `DROP DATABASE ${database}`);
  }
}

async function cloneApiSmoke(env) {
  const probe = createServer();
  await new Promise((resolveProbe, rejectProbe) => {
    probe.once("error", rejectProbe);
    probe.listen(8000, "127.0.0.1", resolveProbe);
  });
  await new Promise((resolveProbe) => probe.close(resolveProbe));
  const python = process.platform === "win32"
    ? join(apiRoot, ".venv", "Scripts", "python.exe")
    : join(apiRoot, ".venv", "bin", "python");
  const child = spawn(python, ["-m", "uvicorn",
    "electro_tutor_api.main:create_app", "--factory", "--host", "127.0.0.1",
    "--port", "8000", "--no-access-log"], {
    cwd: apiRoot, env: { ...process.env, ...env }, stdio: "ignore", shell: false,
  });
  let childError;
  child.once("error", (error) => { childError = error; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode !== null || childError) break;
      try {
        const response = await fetch("http://127.0.0.1:8000/api/v1/health/ready", {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status === 200) { ready = true; break; }
      } catch { /* Wait for the isolated API process to start. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    if (!ready) throw new Error(`Clone API did not become ready on loopback port 8000${childError ? ": process launch failed" : ""}.`);
    await smoke();
  } finally {
    child.kill();
    if (child.exitCode === null && !childError) {
      await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
      ]);
    }
  }
}

async function checkClone() {
  const clone = await inspectIsolatedClone();
  await bootstrap();
  await dependencyAudit();
  await testFast();
  await compose(["config", "--quiet"]);
  await docker(["build", "--tag", "electro-tutor-et103-clone-api", apiRoot]);
  await uv(["run", "--project", apiRoot, "alembic", "upgrade", "head"], { cwd: apiRoot, env: clone.env });
  await uv(["run", "--project", apiRoot, "alembic", "check"], { cwd: apiRoot, env: clone.env });
  await testIntegration({ ensureServices: false, isolatedEnv: clone.env });
  await cloneCatalogBaseline(clone);
  await uv(["run", "--project", apiRoot, "python", "-m", "electro_tutor_api.cli", "db-status"], {
    cwd: apiRoot, env: clone.env,
  });
  await uv(["run", "--project", apiRoot, "python", "-m", "electro_tutor_api.cli", "db-catalog-diagnose"], {
    cwd: apiRoot, env: clone.env,
  });
  await cloneApiSmoke(clone.env);
  console.log("Isolated clone backend verification passed.");
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
    await catalogBaseline("test");
    await smoke();
    console.log("Backend CI-equivalent verification passed.");
  } finally {
    await compose(["down", "--remove-orphans"]);
  }
}

export async function main(operation = "help", option, detail) {
  switch (operation) {
    case "help":
      for (const [name, purpose] of Object.entries(backendCommands)) console.log(`${name.padEnd(17)} ${purpose}`);
      return;
    case "bootstrap": return bootstrap();
    case "build": return compose(["build", "api"]);
    case "check":
      if (option === "clone") return checkClone();
      if (option === undefined) return check();
      throw new Error("Unknown backend check mode.");
    case "dev": return dev();
    case "e2e-dev": return e2eDev();
    case "stop": return compose(["down", "--remove-orphans"]);
    case "logs": return compose(["logs", "--tail", "200", "api", "postgres"]);
    case "status": return compose(["ps"]);
    case "doctor": return doctor();
    case "smoke":
      if (option === "clone") return cloneApiSmoke((await inspectIsolatedClone()).env);
      if (option === undefined) return smoke();
      throw new Error("Unknown backend smoke mode.");
    case "idp:provision": return idpProvision();
    case "idp:dev": return idpProvision();
    case "idp:e2e": return idpProvision();
    case "idp:cleanup": return idpCleanup();
    case "test-fast": return testFast();
    case "test-integration": return testIntegration();
    case "db-status":
      if (option === undefined) return dbStatus();
      if (option !== "catalog-diagnose") throw new Error("Unknown db-status mode.");
      await startPostgres();
      return compose(["run", "--rm", "--build", "migrate", "python", "-m",
        "electro_tutor_api.cli", "db-catalog-diagnose"]);
    case "db-migrate":
      if (option === undefined) return dbMigrate();
      if (option !== "catalog-baseline") throw new Error("Unknown db-migrate mode.");
      return catalogBaseline(detail ?? "check");
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
  await main(process.argv[2], process.argv[3], process.argv[4]);
}
