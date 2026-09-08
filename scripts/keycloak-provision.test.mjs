import { describe, expect, it } from "vitest";
import { CLIENT_ID, EXPECTED_KEYCLOAK_URL, POST_LOGOUT_REDIRECT_URIS, PROVISION_TIMEOUT_MS, REALM, REDIRECT_URIS, TEST_IDENTITY_GROUP, TEST_USERNAME, WEB_ORIGINS, validateProvisioningEnvironment } from "./keycloak-provision.mjs";

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
    expect(TEST_IDENTITY_GROUP).toBe("electro-tutor-et09-3-managed");
    expect(PROVISION_TIMEOUT_MS).toBe(5_000);
  });
});
