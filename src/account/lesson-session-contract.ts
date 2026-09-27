import { isOpaqueUuid } from "./booking-contract";

export type LessonSessionStatus = "READY" | "ACTIVE" | "ENDED" | "CANCELLED";
export type LessonSessionCapability = "SESSION_VIEW" | "SESSION_CREATE" | "SESSION_START" | "SESSION_END";

export interface LessonSession {
  id: string;
  booking_id: string;
  status: LessonSessionStatus;
  effective_status: LessonSessionStatus | "WINDOW_CLOSED";
  version: number;
  participant_role: "student" | "tutor";
  capabilities: LessonSessionCapability[];
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
  current_topic_id: null;
}

export type LessonSessionResult =
  | { ok: true; session: LessonSession }
  | { ok: false; status: number; code: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

export function sessionIdFromFragment(hash: string): string | null {
  const values = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const ids = values.getAll("session");
  return ids.length === 1 && [...values.keys()].every((key) => key === "session")
    && isOpaqueUuid(ids[0]) ? ids[0] : null;
}

export function parseLessonSession(value: unknown): LessonSession | null {
  if (!record(value) || typeof value.id !== "string" || !isOpaqueUuid(value.id)
    || typeof value.booking_id !== "string" || !isOpaqueUuid(value.booking_id)
    || !["READY", "ACTIVE", "ENDED", "CANCELLED"].includes(String(value.status))
    || !["READY", "ACTIVE", "ENDED", "CANCELLED", "WINDOW_CLOSED"].includes(String(value.effective_status))
    || typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1
    || !["student", "tutor"].includes(String(value.participant_role))
    || !Array.isArray(value.capabilities)
    || !value.capabilities.every((item) => ["SESSION_VIEW", "SESSION_CREATE", "SESSION_START", "SESSION_END"].includes(item))
    || !value.capabilities.includes("SESSION_VIEW")
    || !timestamp(value.created_at) || !nullableTimestamp(value.started_at)
    || !nullableTimestamp(value.ended_at) || !nullableTimestamp(value.cancelled_at)
    || value.current_topic_id !== null) return null;
  if (value.status === "READY" && (value.started_at || value.ended_at || value.cancelled_at)) return null;
  if (value.status === "ACTIVE" && (!value.started_at || value.ended_at || value.cancelled_at)) return null;
  if (value.status === "ENDED" && (!value.started_at || !value.ended_at || value.cancelled_at)) return null;
  if (value.status === "CANCELLED" && (!value.cancelled_at || value.started_at || value.ended_at)) return null;
  if (value.participant_role === "student" && (value.capabilities.includes("SESSION_START") || value.capabilities.includes("SESSION_END"))) return null;
  return value as unknown as LessonSession;
}

async function request(fetcher: Fetcher, url: URL, init: RequestInit, expectedId: string, expectedBookingId?: string, expectedRole?: "student" | "tutor"): Promise<LessonSessionResult> {
  try {
    const response = await fetcher(url, { ...init, credentials: "include", cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = record(body) && record(body.error) && typeof body.error.code === "string"
        ? body.error.code : "unexpected_response";
      return { ok: false, status: response.status, code };
    }
    const session = parseLessonSession(body);
    return session && (session.id === expectedId || expectedId === "new")
      && (!expectedBookingId || session.booking_id === expectedBookingId)
      && (!expectedRole || session.participant_role === expectedRole)
      ? { ok: true, session }
      : { ok: false, status: response.status, code: "unexpected_response" };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

export function joinLessonSession(fetcher: Fetcher, origin: URL, bookingId: string, key: string, role: "student" | "tutor"): Promise<LessonSessionResult> {
  return request(fetcher, new URL(`/api/v1/bookings/${bookingId}/lesson-session`, origin), {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": key }, body: "{}",
  }, "new", bookingId, role);
}

export function readLessonSession(fetcher: Fetcher, origin: URL, sessionId: string): Promise<LessonSessionResult> {
  return request(fetcher, new URL(`/api/v1/lesson-sessions/${sessionId}`, origin), {
    method: "GET", headers: { Accept: "application/json" },
  }, sessionId);
}

export function transitionLessonSession(fetcher: Fetcher, origin: URL, session: LessonSession, command: "start" | "end", key: string): Promise<LessonSessionResult> {
  return request(fetcher, new URL(`/api/v1/lesson-sessions/${session.id}/${command}`, origin), {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ expected_version: session.version }),
  }, session.id, session.booking_id);
}
