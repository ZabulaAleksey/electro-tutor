import { describe, expect, it } from "vitest";
import {
  EXPECTED_KEYCLOAK_URL,
  REGISTRATION_KEYCLOAK_URL,
  validateProvisioningEnvironment,
} from "./keycloak-provision.mjs";

describe("RC1 isolated Keycloak registration provider", () => {
  it("accepts only the explicit test registration provider", () => {
    expect(() => validateProvisioningEnvironment({
      ET_ENVIRONMENT: "test",
      ET_TEST_OIDC_PORT: "58181",
      ET_KEYCLOAK_URL: REGISTRATION_KEYCLOAK_URL,
    })).not.toThrow();
  });

  it("keeps the ordinary provider contract unchanged", () => {
    expect(() => validateProvisioningEnvironment({
      ET_KEYCLOAK_URL: EXPECTED_KEYCLOAK_URL,
    })).not.toThrow();
  });

  it("rejects an unscoped or foreign registration provider", () => {
    expect(() => validateProvisioningEnvironment({
      ET_TEST_OIDC_PORT: "58181",
      ET_KEYCLOAK_URL: REGISTRATION_KEYCLOAK_URL,
    })).toThrow(/requires ET_ENVIRONMENT=test/);
    expect(() => validateProvisioningEnvironment({
      ET_ENVIRONMENT: "test",
      ET_TEST_OIDC_PORT: "58180",
      ET_KEYCLOAK_URL: REGISTRATION_KEYCLOAK_URL,
    })).toThrow(/requires ET_ENVIRONMENT=test/);
    expect(() => validateProvisioningEnvironment({
      ET_ENVIRONMENT: "test",
      ET_TEST_OIDC_PORT: "58181",
      ET_KEYCLOAK_URL: EXPECTED_KEYCLOAK_URL,
    })).toThrow(/must be exactly/);
  });
});
