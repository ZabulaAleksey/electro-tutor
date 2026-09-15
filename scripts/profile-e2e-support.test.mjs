import { describe, expect, it } from "vitest";
import { classifyProvisioningFailure, redactedE2ECommandError } from "./profile-e2e-support.mjs";

describe("ET-10.2 secret-free provisioning diagnostics", () => {
  const sentinel = "sentinel-private-password-not-for-output";

  it.each([
    ["Keycloak POST /realms/master/protocol/openid-connect/token returned 401", "keycloak_admin_auth_rejected"],
    ["Refusing to mutate an existing Keycloak user not owned by ET-09.3 provisioning", "managed_identity_ownership_conflict"],
    ["Keycloak test identity must not have realm-management roles", "managed_identity_privilege_conflict"],
    ["Keycloak test identity ownership group did not reconcile", "managed_identity_group_conflict"],
    ["Keycloak PUT /admin/realms/electro-tutor-dev/users returned 409", "keycloak_admin_api_rejected"],
    ["docker.exe compose -f compose.yaml up failed with exit code 1", "local_service_start_failed"],
    ["some unknown failure", "unclassified"],
  ])("maps allowlisted child errors to fixed codes only", (marker, expected) => {
    const result = classifyProvisioningFailure(`${marker}\n${sentinel}`);
    expect(result).toBe(expected);
    expect(result).not.toContain(sentinel);
    expect(result).toMatch(/^[a-z_]+$/u);
  });

  it("never includes child stderr even for a classified provisioning failure", () => {
    const error = redactedE2ECommandError({
      label: "backend idp:e2e",
      status: 1,
      stderr: `Keycloak POST /realms/master/protocol/openid-connect/token returned 401; ${sentinel}`,
    });
    expect(error.message).toBe(
      "backend idp:e2e failed (exit 1); diagnostic=keycloak_admin_auth_rejected; output was redacted.",
    );
    expect(error.message).not.toContain(sentinel);
  });
});
