import { describe, expect, it } from "vitest";
import {
  CLIENT_ID,
  EXPECTED_KEYCLOAK_URL,
  POST_LOGOUT_REDIRECT_URIS,
  PROVISION_TIMEOUT_MS,
  REALM,
  REDIRECT_URIS,
  SECONDARY_TEST_USERNAME,
  THIRD_TEST_USERNAME,
  TEST_IDENTITIES,
  TEST_IDENTITY_GROUP,
  TEST_USERNAME,
  WEB_ORIGINS,
  validateImmutableSubject,
  validateProvisioningEnvironment,
} from "./keycloak-provision.mjs";

describe("ET-09.3 local Keycloak contract", () => {
  it("pins the Tutor DEV realm and public client", () => {
    expect(REALM).toBe("electro-tutor-dev");
    expect(CLIENT_ID).toBe("electro-tutor-web-dev");
    expect(REDIRECT_URIS).toEqual(["http://127.0.0.1:8000/api/v1/auth/callback"]);
    expect(WEB_ORIGINS).toEqual(["http://127.0.0.1:4321", "http://127.0.0.1:4322"]);
    expect(POST_LOGOUT_REDIRECT_URIS).toEqual(["http://127.0.0.1:4321/", "http://127.0.0.1:4322/"]);
  });

  it("fails closed for a foreign admin endpoint or test identity", () => {
    expect(() => validateProvisioningEnvironment({ ET_KEYCLOAK_URL: "http://127.0.0.1:9999" })).toThrow(/must be exactly/);
    expect(() => validateProvisioningEnvironment({ ET_DEV_TEST_USERNAME: "existing-user" })).toThrow(/must be exactly/);
    expect(EXPECTED_KEYCLOAK_URL).toBe("http://127.0.0.1:58081");
    expect(TEST_USERNAME).toBe("et-dev-acceptance");
    expect(SECONDARY_TEST_USERNAME).toBe("et-dev-acceptance-b");
    expect(THIRD_TEST_USERNAME).toBe("et-dev-acceptance-c");
    expect(TEST_IDENTITIES.map(({ username }) => username)).toEqual([
      "et-dev-acceptance",
      "et-dev-acceptance-b",
      "et-dev-acceptance-c",
    ]);
    expect(TEST_IDENTITIES.map(({ defaultEmail }) => defaultEmail)).toEqual([
      "et-dev-acceptance@invalid.example",
      "et-dev-acceptance-b@invalid.example",
      "et-dev-acceptance-c@invalid.example",
    ]);
    expect(Object.isFrozen(TEST_IDENTITIES)).toBe(true);
    expect(TEST_IDENTITIES.every(Object.isFrozen)).toBe(true);
    expect(TEST_IDENTITY_GROUP).toBe("electro-tutor-et09-3-managed");
    expect(PROVISION_TIMEOUT_MS).toBe(5_000);
  });

  it("accepts only canonical immutable Keycloak subject UUIDs", () => {
    const subject = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(validateImmutableSubject(subject)).toBe(subject);
    expect(() => validateImmutableSubject(subject.toUpperCase())).toThrow(/canonical UUID/);
    expect(() => validateImmutableSubject("provider-email@example.test")).toThrow(/canonical UUID/);
  });

  it("keeps the three-user lifecycle on one shared secret and ownership preflight", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("scripts/keycloak-provision.mjs", "utf8"),
    );
    expect(source).toContain('required("ET_DEV_TEST_PASSWORD")');
    expect(source).not.toContain("ET_DEV_TEST_PASSWORD_B");
    expect(source).toContain('{ groups: [`/${TEST_IDENTITY_GROUP}`] }');
    expect(source.indexOf("const preflight = []")).toBeLessThan(
      source.indexOf("for (const { identity, existing } of preflight)"),
    );
    expect(source.indexOf("for (const { identity, existing } of preflight)")).toBeLessThan(
      source.indexOf("await reconcileManagedIdentity("),
    );
    expect(source.indexOf("// Delete only after every existing user passed")).toBeLessThan(
      source.indexOf('method: "DELETE"'),
    );
  });
});
