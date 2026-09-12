export const OWN_PROFILE_PATHS = {
  student: "/api/v1/profiles/student/me",
  tutor: "/api/v1/profiles/tutor/me",
} as const;

export type ProfileKind = keyof typeof OWN_PROFILE_PATHS;
export type ProfileWriteMethod = "PUT" | "PATCH";

export type DisplayNameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "required" | "too_long" | "control_character" };

export type SessionResult =
  | { ok: true; identityLabel: string }
  | { ok: false; status: number; code: string };

export interface OwnProfile {
  displayName: string;
  updatedAt: string;
}

export type ProfileResult =
  | { ok: true; profile: OwnProfile }
  | { ok: false; status: number; code: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorCode(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return "unexpected_response";
  }
  return value.error.code;
}

export function resolveLocalApiOrigin(location: { origin: string; port: string }): URL | null {
  if (location.port !== "4321" && location.port !== "4322") return null;
  const origin = new URL(location.origin);
  origin.port = "8000";
  return origin;
}

export function normalizeDisplayName(value: string): DisplayNameValidation {
  const normalized = value.normalize("NFC");
  if (/\p{C}/u.test(normalized)) return { ok: false, reason: "control_character" };

  const collapsed = normalized.trim().replace(/\s+/gu, " ");
  const codePoints = [...collapsed].length;
  if (codePoints === 0) return { ok: false, reason: "required" };
  if (codePoints > 80) return { ok: false, reason: "too_long" };
  return { ok: true, value: collapsed };
}

export async function fetchCurrentSession(fetcher: Fetcher, apiOrigin: URL): Promise<SessionResult> {
  try {
    const response = await fetcher(new URL("/api/v1/me", apiOrigin), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await readJson(response);
    if (!response.ok) return { ok: false, status: response.status, code: errorCode(body) };
    if (!isRecord(body)) return { ok: false, status: response.status, code: "unexpected_response" };

    const identityLabel = typeof body.email === "string" && body.email.trim()
      ? body.email
      : typeof body.subject === "string" && body.subject.trim()
        ? body.subject
        : "";
    return identityLabel
      ? { ok: true, identityLabel }
      : { ok: false, status: response.status, code: "unexpected_response" };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

export async function fetchOwnProfile(
  fetcher: Fetcher,
  apiOrigin: URL,
  kind: ProfileKind,
): Promise<ProfileResult> {
  return requestProfile(fetcher, apiOrigin, kind, "GET");
}

export async function writeOwnProfile(
  fetcher: Fetcher,
  apiOrigin: URL,
  kind: ProfileKind,
  method: ProfileWriteMethod,
  displayName: string,
): Promise<ProfileResult> {
  return requestProfile(fetcher, apiOrigin, kind, method, displayName);
}

async function requestProfile(
  fetcher: Fetcher,
  apiOrigin: URL,
  kind: ProfileKind,
  method: "GET" | ProfileWriteMethod,
  displayName?: string,
): Promise<ProfileResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, credentials: "include", cache: "no-store", headers };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({ display_name: displayName });
  }

  try {
    const response = await fetcher(new URL(OWN_PROFILE_PATHS[kind], apiOrigin), init);
    const body = await readJson(response);
    if (!response.ok) return { ok: false, status: response.status, code: errorCode(body) };
    if (
      !isRecord(body)
      || typeof body.display_name !== "string"
      || typeof body.updated_at !== "string"
    ) {
      return { ok: false, status: response.status, code: "unexpected_response" };
    }
    return { ok: true, profile: { displayName: body.display_name, updatedAt: body.updated_at } };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}
