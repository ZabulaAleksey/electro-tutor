import { describe, expect, it } from "vitest";
import {
  OWN_PROFILE_PATHS,
  fetchCurrentSession,
  fetchOwnProfile,
  normalizeDisplayName,
  resolveLocalApiOrigin,
  writeOwnProfile,
} from "./profile-contract";

const apiOrigin = new URL("http://127.0.0.1:8000/");

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("own-profile browser contract", () => {
  it("uses only canonical literal /me routes and never asks the client for an owner id", () => {
    expect(OWN_PROFILE_PATHS).toEqual({
      student: "/api/v1/profiles/student/me",
      tutor: "/api/v1/profiles/tutor/me",
    });
    expect(JSON.stringify(OWN_PROFILE_PATHS)).not.toContain("account_id");
    expect(Object.values(OWN_PROFILE_PATHS).every((path) => !path.includes("{"))).toBe(true);
  });

  it("resolves the loopback API only for the approved dev web ports", () => {
    expect(resolveLocalApiOrigin({ origin: "http://127.0.0.1:4322", port: "4322" })?.href)
      .toBe("http://127.0.0.1:8000/");
    expect(resolveLocalApiOrigin({ origin: "https://example.test", port: "" })).toBeNull();
  });

  it("normalizes names like the server boundary and counts Unicode code points", () => {
    expect(normalizeDisplayName("  Іван   Петренко  ")).toEqual({ ok: true, value: "Іван Петренко" });
    expect(normalizeDisplayName("e\u0301")).toEqual({ ok: true, value: "é" });
    expect(normalizeDisplayName(" ")).toEqual({ ok: false, reason: "required" });
    expect(normalizeDisplayName("safe\u0000unsafe")).toEqual({ ok: false, reason: "control_character" });
    expect(normalizeDisplayName("Іван\tПетренко")).toEqual({ ok: false, reason: "control_character" });
    expect(normalizeDisplayName("🙂".repeat(80)).ok).toBe(true);
    expect(normalizeDisplayName("🙂".repeat(81))).toEqual({ ok: false, reason: "too_long" });
  });

  it("sends credentialed private reads and drops the returned account id", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const result = await fetchOwnProfile(async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({
        account_id: "11111111-1111-4111-8111-111111111111",
        display_name: "Student",
        created_at: "2026-09-12T00:00:00Z",
        updated_at: "2026-09-12T00:00:00Z",
      });
    }, apiOrigin, "student");

    expect(capturedUrl).toBe("http://127.0.0.1:8000/api/v1/profiles/student/me");
    expect(capturedInit).toMatchObject({ method: "GET", credentials: "include", cache: "no-store" });
    expect(result).toEqual({ ok: true, profile: { displayName: "Student", updatedAt: "2026-09-12T00:00:00Z" } });
    expect(JSON.stringify(result)).not.toContain("11111111");
  });

  it("writes only display_name and preserves stable permission errors", async () => {
    let capturedBody: BodyInit | null | undefined;
    const result = await writeOwnProfile(async (_input, init) => {
      capturedBody = init?.body;
      return jsonResponse({ error: { code: "capability_required", message: "denied", request_id: "safe", details: {} } }, 403);
    }, apiOrigin, "tutor", "PUT", "Tutor");

    expect(capturedBody).toBe(JSON.stringify({ display_name: "Tutor" }));
    expect(String(capturedBody)).not.toMatch(/account|identity|role|capability/i);
    expect(result).toEqual({ ok: false, status: 403, code: "capability_required" });
  });

  it.each([
    [401, "authentication_required"],
    [404, "profile_not_found"],
    [409, "profile_already_exists"],
    [422, "invalid_request"],
    [503, "audit_unavailable"],
  ] as const)("preserves the stable %i %s envelope", async (status, code) => {
    const result = await fetchOwnProfile(
      async () => jsonResponse({ error: { code, message: "redacted", request_id: "safe", details: {} } }, status),
      apiOrigin,
      "student",
    );
    expect(result).toEqual({ ok: false, status, code });
  });

  it("fails closed on a malformed successful profile response", async () => {
    const result = await fetchOwnProfile(
      async () => jsonResponse({ display_name: "Student" }),
      apiOrigin,
      "student",
    );
    expect(result).toEqual({ ok: false, status: 200, code: "unexpected_response" });
  });

  it("keeps only a display label from the session response", async () => {
    const result = await fetchCurrentSession(async () => jsonResponse({
      identity_id: "22222222-2222-4222-8222-222222222222",
      issuer: "http://127.0.0.1:58081/realms/electro-tutor-dev",
      subject: "opaque-subject",
      email: "student@invalid.example",
    }), apiOrigin);

    expect(result).toEqual({ ok: true, identityLabel: "student@invalid.example" });
    expect(JSON.stringify(result)).not.toContain("identity_id");
    expect(JSON.stringify(result)).not.toContain("issuer");
  });
});
