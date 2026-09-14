import { describe, expect, it } from "vitest";
import {
  bookingErrorKey,
  MutationAttemptStore,
  SessionGeneration,
  createOffer,
  formatBookingMoney,
  formatBookingTime,
  browserTimeZone,
  isOpaqueUuid,
  listBookings,
  readOffer,
  requestBooking,
  snapshotTimeZone,
  toOffsetRfc3339,
  transitionBooking,
  type TutorOffer,
} from "./booking-contract";

const api = new URL("http://127.0.0.1:8000/");
const offerId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";

const rawOffer = {
  id: offerId,
  status: "ACTIVE",
  version: 3,
  title: "Circuit review",
  starts_at: "2026-10-15T18:00:00Z",
  ends_at: "2026-10-15T19:00:00Z",
  time_zone: "Europe/Kyiv",
  duration_minutes: 60,
  minimum_notice_minutes: 30,
  payment_mode: "EXTERNAL",
  amount_minor: 12345,
  currency: "UAH",
  currency_exponent: 2,
  created_at: "2026-09-14T00:00:00Z",
  updated_at: "2026-09-14T00:00:00Z",
  published_at: "2026-09-14T00:00:00Z",
  retired_at: null,
};

const rawBooking = {
  id: bookingId,
  offer_id: offerId,
  status: "REQUESTED",
  version: 1,
  snapshot: {
    snapshot_version: 1,
    offer_version: 3,
    offer_title: "Circuit review",
    starts_at: "2026-10-15T18:00:00Z",
    ends_at: "2026-10-15T19:00:00Z",
    tutor_time_zone: "Europe/Kyiv",
    student_time_zone: "UTC",
    duration_minutes: 60,
    minimum_notice_minutes: 30,
    payment_mode: "EXTERNAL",
    amount_minor: 12345,
    currency: "UAH",
    currency_exponent: 2,
    cancellation_policy_code: "participant_before_start_v1",
  },
  requested_at: "2026-09-14T00:00:00Z",
  accepted_at: null,
  declined_at: null,
  cancelled_at: null,
  cancelled_by: null,
};

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("booking browser contract", () => {
  it("accepts only opaque canonical UUIDs and never needs an account id", () => {
    expect(isOpaqueUuid(offerId)).toBe(true);
    expect(isOpaqueUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isOpaqueUuid("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe(false);
    expect(isOpaqueUuid("student-account")).toBe(false);
  });

  it("reads an active offer by opaque route with private no-cache credentials", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const result = await readOffer(async (input, options) => {
      url = String(input);
      init = options;
      return response({ ...rawOffer, tutor_account_id: "not-for-client" });
    }, api, offerId);

    expect(url).toBe(`http://127.0.0.1:8000/api/v1/tutor-offers/${offerId}`);
    expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(result.ok && result.value.title).toBe("Circuit review");
    expect(JSON.stringify(result)).not.toContain("tutor_account_id");
  });

  it("creates an offer using only terms and the idempotency header", async () => {
    let body = "";
    let headers: HeadersInit | undefined;
    const result = await createOffer(async (_input, init) => {
      body = String(init?.body);
      headers = init?.headers;
      return response({ ...rawOffer, status: "DRAFT", version: 1 }, 201);
    }, api, {
      title: "Circuit review",
      startsAt: "2026-10-15T21:00:00+03:00",
      timeZone: "Europe/Kyiv",
      durationMinutes: 60,
      minimumNoticeMinutes: 30,
      paymentMode: "EXTERNAL",
      amountMinor: 12345,
      currency: "UAH",
    }, operationId);

    expect(result.ok).toBe(true);
    expect(headers).toMatchObject({ "Idempotency-Key": operationId });
    expect(JSON.parse(body)).toEqual({
      title: "Circuit review",
      starts_at: "2026-10-15T21:00:00+03:00",
      time_zone: "Europe/Kyiv",
      duration_minutes: 60,
      minimum_notice_minutes: 30,
      payment_mode: "EXTERNAL",
      amount_minor: 12345,
      currency: "UAH",
    });
    expect(body).not.toMatch(/account|owner|exponent|status/i);
  });

  it("requests the observed offer and browser zone without snapshot or participant input", async () => {
    let body = "";
    const offer = (await readOffer(async () => response(rawOffer), api, offerId));
    expect(offer.ok).toBe(true);
    const result = await requestBooking(async (_input, init) => {
      body = String(init?.body);
      return response(rawBooking, 201);
    }, api, (offer as { ok: true; value: TutorOffer }).value, "UTC", operationId);

    expect(result.ok).toBe(true);
    expect(JSON.parse(body)).toEqual({ observed_offer_version: 3, student_time_zone: "UTC" });
    expect(body).not.toMatch(/account|price|amount|status|snapshot/i);
  });

  it("keeps the immutable snapshot from list and transition responses", async () => {
    const listed = await listBookings(async () => response([rawBooking]), api, "student");
    expect(listed.ok && listed.value[0]?.snapshot.offerVersion).toBe(3);
    expect(listed.ok && listed.value[0]?.snapshot.amountMinor).toBe(12345);

    if (!listed.ok || !listed.value[0]) throw new Error("expected parsed booking");
    const booking = listed.value[0];
    let body = "";
    const accepted = await transitionBooking(async (_input, init) => {
      body = String(init?.body);
      return response({ ...rawBooking, status: "ACCEPTED", version: 2 });
    }, api, booking, "accept", operationId);
    expect(JSON.parse(body)).toEqual({ expected_version: 1 });
    expect(accepted.ok && accepted.value.snapshot).toEqual(booking.snapshot);
  });

  it("formats RU/UK money and explicit IANA-zone time without a date library", () => {
    expect(formatBookingMoney("ru", "FREE", 0, null)).toBe("FREE");
    expect(formatBookingMoney("uk", "EXTERNAL", 12345, "UAH")).toMatch(/123[,.]45/);
    expect(formatBookingTime("uk", rawOffer.starts_at, "Europe/Kyiv")).toContain("Europe/Kyiv");
    expect(toOffsetRfc3339("2026-10-15T18:30")).toMatch(/^2026-10-15T18:30:00[+-]\d{2}:\d{2}$/);
  });

  it("fails closed when the browser cannot provide a validated IANA timezone", () => {
    expect(browserTimeZone("Europe/Kyiv")).toBe("Europe/Kyiv");
    expect(browserTimeZone("")).toBeNull();
    expect(browserTimeZone("Not/A_Zone")).toBeNull();
  });

  it("preserves stable stale, permission and dependency errors", async () => {
    for (const [status, code] of [[403, "capability_required"], [409, "offer_changed"], [503, "audit_unavailable"]] as const) {
      const result = await readOffer(async () => response({ error: { code } }, status), api, offerId);
      expect(result).toEqual({ ok: false, status, code });
    }
  });

  it("maps stale, overlap, permission and retryable dependency failures to distinct UI states", () => {
    expect(bookingErrorKey("offer_changed")).toBe("stale");
    expect(bookingErrorKey("booking_overlap")).toBe("conflict");
    expect(bookingErrorKey("capability_required")).toBe("permission");
    expect(bookingErrorKey("audit_unavailable")).toBe("failed");
  });

  it("reuses an operation only after an ambiguous failure and rotates when intent changes", () => {
    let sequence = 0;
    const attempts = new MutationAttemptStore(() => `operation-${++sequence}`);
    const first = attempts.operationFor("offer:create", "intent-a");
    attempts.settle("offer:create", "intent-a", { ok: false, status: 0, code: "network_error" });
    expect(attempts.operationFor("offer:create", "intent-a")).toBe(first);
    expect(attempts.operationFor("offer:create", "intent-b")).toBe("operation-2");
    attempts.settle("offer:create", "intent-b", { ok: false, status: 409, code: "version_conflict" });
    expect(attempts.operationFor("offer:create", "intent-b")).toBe("operation-3");
    attempts.settle("offer:create", "intent-b", { ok: true, value: rawOffer as unknown as TutorOffer });
    expect(attempts.operationFor("offer:create", "intent-b")).toBe("operation-4");
  });

  it.each([500, 502, 503, 504])("retains the operation after ambiguous HTTP %i", (status) => {
    let sequence = 0;
    const attempts = new MutationAttemptStore(() => `operation-${++sequence}`);
    const first = attempts.operationFor("booking:accept", "version-1");
    attempts.settle("booking:accept", "version-1", { ok: false, status, code: "dependency_unavailable" });
    expect(attempts.operationFor("booking:accept", "version-1")).toBe(first);
  });

  it("invalidates every captured async continuation when session generation advances", () => {
    const generation = new SessionGeneration();
    const first = generation.capture();
    expect(generation.isCurrent(first)).toBe(true);
    generation.advance();
    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.isCurrent(generation.capture())).toBe(true);
  });

  it("selects the participant timezone for the same immutable snapshot", () => {
    const snapshot = {
      ...(rawBooking.snapshot as unknown as import("./booking-contract").BookingSnapshot),
      tutorTimeZone: "Europe/Kyiv",
      studentTimeZone: "America/Toronto",
    };
    expect(snapshotTimeZone(snapshot, "tutor")).toBe("Europe/Kyiv");
    expect(snapshotTimeZone(snapshot, "student")).toBe("America/Toronto");
  });

  it.each([
    { ...rawOffer, payment_mode: "FREE", amount_minor: 0, currency: "UAH", currency_exponent: null },
    { ...rawOffer, payment_mode: "FREE", amount_minor: 1, currency: null, currency_exponent: null },
    { ...rawOffer, payment_mode: "EXTERNAL", currency: null, currency_exponent: 2 },
    { ...rawOffer, payment_mode: "EXTERNAL", currency_exponent: null },
  ])("fails closed on an inconsistent successful offer money tuple", async (body) => {
    const result = await readOffer(async () => response(body), api, offerId);
    expect(result).toEqual({ ok: false, status: 200, code: "unexpected_response" });
  });

  it("fails closed on an inconsistent immutable snapshot money tuple", async () => {
    const malformed = {
      ...rawBooking,
      snapshot: { ...rawBooking.snapshot, payment_mode: "FREE", amount_minor: 0, currency: "UAH", currency_exponent: null },
    };
    const result = await listBookings(async () => response([malformed]), api, "student");
    expect(result).toEqual({ ok: false, status: 200, code: "unexpected_response" });
  });
});
