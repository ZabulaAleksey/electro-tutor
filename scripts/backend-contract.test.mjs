import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { backendCommands, backendEnv, main, validateLocalNetwork } from "./backend.mjs";

const composeSource = await readFile("compose.yaml", "utf8");
const compose = parse(composeSource);

describe("ET-09.2 backend command contract", () => {
  it("exposes the approved root command catalog", () => {
    expect(Object.keys(backendCommands)).toEqual([
      "bootstrap",
      "build",
      "check",
      "dev",
      "stop",
      "logs",
      "status",
      "doctor",
      "smoke",
      "idp:provision",
      "idp:dev",
      "idp:cleanup",
      "test-fast",
      "test-integration",
      "db-status",
      "db-migrate",
      "db-reset-local",
    ]);
  });

  it("uses loopback and disables docs outside the explicit local profile", () => {
    expect(backendEnv("test")).toMatchObject({
      ET_ENVIRONMENT: "test",
      ET_HOST: "127.0.0.1",
      ET_DOCS_ENABLED: "false",
    });
    expect(backendEnv("test").ET_DATABASE_URL).toContain("@127.0.0.1:55432/");
  });

  it("pins API and PostgreSQL host publishing to loopback", () => {
    expect(composeSource).toContain('"127.0.0.1:8000:8000"');
    expect(composeSource).toContain('"127.0.0.1:55432:5432"');
    expect(composeSource).not.toContain("${ET_POSTGRES_BIND_HOST");
    expect(() => validateLocalNetwork({ ET_POSTGRES_BIND_HOST: "0.0.0.0" })).toThrow(
      /must remain on 127\.0\.0\.1/,
    );
  });

  it("bounds diagnostic HTTP calls", async () => {
    const backendSource = await readFile("scripts/backend.mjs", "utf8");
    expect(backendSource).toContain("AbortSignal.timeout(diagnosticTimeoutMs)");
  });

  it("keeps OIDC callback query values out of the default access log", async () => {
    const dockerfile = await readFile("services/api/Dockerfile", "utf8");
    expect(dockerfile).toContain('"--no-access-log"');
  });

  it("fails the dedicated real auth command closed when credentials are absent", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const runner = await readFile("scripts/run-auth-e2e.mjs", "utf8");
    expect(packageJson.scripts["test:e2e:auth"]).toBe("node scripts/run-auth-e2e.mjs");
    expect(runner).toContain('"ET_KEYCLOAK_ADMIN_PASSWORD"');
    expect(runner).toContain('"ET_DEV_TEST_PASSWORD"');
    expect(runner).toContain('process.env.E2E_SPEC = "tests/e2e/auth-flow.spec.ts"');
  });

  it("does not expose secret values through the command catalog", () => {
    expect(JSON.stringify(backendCommands)).not.toMatch(/password|database_url|secret/i);
  });

  it("keeps the migrator credential out of the long-running API", () => {
    expect(compose.services.api.environment).not.toHaveProperty("ET_MIGRATION_DATABASE_URL");
    expect(compose.services.migrate.environment).toHaveProperty("ET_MIGRATION_DATABASE_URL");
  });

  it("denies destructive local reset without the exact confirmation", async () => {
    const previous = process.env.ET_CONFIRM_RESET_LOCAL;
    delete process.env.ET_CONFIRM_RESET_LOCAL;
    try {
      await expect(main("db-reset-local")).rejects.toThrow(/Refusing local DB reset/);
    } finally {
      if (previous === undefined) delete process.env.ET_CONFIRM_RESET_LOCAL;
      else process.env.ET_CONFIRM_RESET_LOCAL = previous;
    }
  });

  it("keeps the local Keycloak volume outside the PostgreSQL reset boundary", async () => {
    const backendSource = await readFile("scripts/backend.mjs", "utf8");
    expect(backendSource).toContain('docker(["volume", "rm", localPostgresVolume])');
    expect(backendSource).not.toContain('compose(["down", "--volumes"');
  });
});
