import { isOpaqueUuid } from "./booking-contract";

export type LessonAccessResult =
  | { ok: true; role: "student" | "tutor"; validUntil: string }
  | { ok: false; status: number; code: string };

export function bookingIdFromFragment(hash: string): string | null {
  const values = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const ids = values.getAll("booking");
  return ids.length === 1 && isOpaqueUuid(ids[0]) ? ids[0] : null;
}

export async function readLessonAccess(
  fetcher: typeof fetch,
  origin: URL,
  bookingId: string,
): Promise<LessonAccessResult> {
  if (!isOpaqueUuid(bookingId)) return { ok: false, status: 0, code: "booking_not_found" };
  try {
    const response = await fetcher(new URL(`/api/v1/bookings/${bookingId}/lesson-access`, origin), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? body.error : null;
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code : "unexpected_response";
      return { ok: false, status: response.status, code };
    }
    if (!body || typeof body !== "object") return { ok: false, status: response.status, code: "unexpected_response" };
    const decision = body as Record<string, unknown>;
    if (decision.booking_id !== bookingId || decision.status !== "ACTIVE"
      || typeof decision.grant_id !== "string" || !isOpaqueUuid(decision.grant_id)
      || !["student", "tutor"].includes(String(decision.participant_role))
      || !Array.isArray(decision.capabilities)
      || decision.capabilities.length !== 1
      || decision.capabilities[0] !== "LESSON_SHELL_ENTER"
      || typeof decision.valid_from !== "string"
      || !Number.isFinite(Date.parse(decision.valid_from))
      || typeof decision.valid_until !== "string"
      || !Number.isFinite(Date.parse(decision.valid_until))
      || Date.parse(decision.valid_from) >= Date.parse(decision.valid_until)) {
      return { ok: false, status: response.status, code: "unexpected_response" };
    }
    return {
      ok: true,
      role: decision.participant_role as "student" | "tutor",
      validUntil: decision.valid_until,
    };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}
