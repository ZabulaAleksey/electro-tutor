import process from "node:process";

for (const name of ["ET_KEYCLOAK_ADMIN_PASSWORD", "ET_DEV_TEST_PASSWORD"]) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for real ET-09.3 browser acceptance`);
  }
}

process.env.E2E_SPEC = "tests/e2e/auth-flow.spec.ts";
await import("./run-e2e.mjs");
