import type { Language } from "../types";

export type PaymentMode = "FREE" | "EXTERNAL";
export type TutorOfferStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type BookingStatus = "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
export type BookingRole = "student" | "tutor";

export interface TutorOffer {
  id: string;
  status: TutorOfferStatus;
  version: number;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  paymentMode: PaymentMode;
  amountMinor: number;
  currency: "UAH" | "EUR" | "USD" | null;
  currencyExponent: number | null;
}

export interface BookingSnapshot {
  snapshotVersion: number;
  offerVersion: number;
  offerTitle: string;
  startsAt: string;
  endsAt: string;
  tutorTimeZone: string;
  studentTimeZone: string;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  paymentMode: PaymentMode;
  amountMinor: number;
  currency: "UAH" | "EUR" | "USD" | null;
  currencyExponent: number | null;
  cancellationPolicyCode: string;
}

export interface Booking {
  id: string;
  offerId: string;
  status: BookingStatus;
  version: number;
  snapshot: BookingSnapshot;
}

export interface OfferWriteInput {
  title: string;
  startsAt: string;
  timeZone: string;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  paymentMode: PaymentMode;
  amountMinor: number;
  currency: "UAH" | "EUR" | "USD" | null;
}

export type BookingApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface PendingMutation {
  intent: string;
  operationId: string;
}

export class MutationAttemptStore {
  private readonly pending = new Map<string, PendingMutation>();

  constructor(private readonly createOperationId: () => string) {}

  operationFor(slot: string, intent: string): string {
    const existing = this.pending.get(slot);
    if (existing?.intent === intent) return existing.operationId;
    const operationId = this.createOperationId();
    this.pending.set(slot, { intent, operationId });
    return operationId;
  }

  settle<T>(slot: string, intent: string, result: BookingApiResult<T>): void {
    const existing = this.pending.get(slot);
    if (!existing || existing.intent !== intent) return;
    if (result.ok || (result.status >= 400 && result.status < 500)) this.pending.delete(slot);
  }

  clear(): void {
    this.pending.clear();
  }
}

export class SessionGeneration {
  private value = 0;

  advance(): number {
    this.value += 1;
    return this.value;
  }

  capture(): number {
    return this.value;
  }

  isCurrent(captured: number): boolean {
    return captured === this.value;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return "unexpected_response";
  }
  return value.error.code;
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function parseOffer(value: unknown): TutorOffer | null {
  if (!isRecord(value)) return null;
  const id = string(value.id);
  const status = string(value.status);
  const title = string(value.title);
  const startsAt = string(value.starts_at);
  const endsAt = string(value.ends_at);
  const timeZone = string(value.time_zone);
  const paymentMode = string(value.payment_mode);
  const currency = value.currency === null ? null : string(value.currency);
  const version = integer(value.version);
  const durationMinutes = integer(value.duration_minutes);
  const minimumNoticeMinutes = integer(value.minimum_notice_minutes);
  const amountMinor = integer(value.amount_minor);
  const currencyExponent = value.currency_exponent === null ? null : integer(value.currency_exponent);
  if (
    !("currency" in value) || !("currency_exponent" in value)
    || !id || !UUID.test(id) || !title || !startsAt || !endsAt || !timeZone || version === null
    || durationMinutes === null || minimumNoticeMinutes === null || amountMinor === null
    || !(["DRAFT", "ACTIVE", "RETIRED"] as string[]).includes(status ?? "")
    || !(["FREE", "EXTERNAL"] as string[]).includes(paymentMode ?? "")
    || (currency !== null && !(["UAH", "EUR", "USD"] as string[]).includes(currency))
    || (paymentMode === "FREE" && (amountMinor !== 0 || currency !== null || currencyExponent !== null))
    || (paymentMode === "EXTERNAL" && (currency === null || currencyExponent !== 2 || amountMinor < 1 || amountMinor > 100_000_000))
  ) return null;
  return {
    id,
    status: status as TutorOfferStatus,
    version,
    title,
    startsAt,
    endsAt,
    timeZone,
    durationMinutes,
    minimumNoticeMinutes,
    paymentMode: paymentMode as PaymentMode,
    amountMinor,
    currency: currency as TutorOffer["currency"],
    currencyExponent,
  };
}

function parseSnapshot(value: unknown): BookingSnapshot | null {
  if (!isRecord(value)) return null;
  const paymentMode = string(value.payment_mode);
  const currency = value.currency === null ? null : string(value.currency);
  const result = {
    snapshotVersion: integer(value.snapshot_version),
    offerVersion: integer(value.offer_version),
    offerTitle: string(value.offer_title),
    startsAt: string(value.starts_at),
    endsAt: string(value.ends_at),
    tutorTimeZone: string(value.tutor_time_zone),
    studentTimeZone: string(value.student_time_zone),
    durationMinutes: integer(value.duration_minutes),
    minimumNoticeMinutes: integer(value.minimum_notice_minutes),
    paymentMode,
    amountMinor: integer(value.amount_minor),
    currency,
    currencyExponent: value.currency_exponent === null ? null : integer(value.currency_exponent),
    cancellationPolicyCode: string(value.cancellation_policy_code),
  };
  if (
    !("currency" in value) || !("currency_exponent" in value)
    || result.snapshotVersion === null || result.offerVersion === null || !result.offerTitle
    || !result.startsAt || !result.endsAt || !result.tutorTimeZone || !result.studentTimeZone
    || result.durationMinutes === null || result.minimumNoticeMinutes === null
    || result.amountMinor === null || !result.cancellationPolicyCode
    || !(["FREE", "EXTERNAL"] as string[]).includes(paymentMode ?? "")
    || (currency !== null && !(["UAH", "EUR", "USD"] as string[]).includes(currency))
    || (paymentMode === "FREE" && (result.amountMinor !== 0 || currency !== null || result.currencyExponent !== null))
    || (paymentMode === "EXTERNAL" && (currency === null || result.currencyExponent !== 2 || (result.amountMinor ?? 0) < 1 || (result.amountMinor ?? 0) > 100_000_000))
  ) return null;
  return { ...result, paymentMode: paymentMode as PaymentMode, currency: currency as BookingSnapshot["currency"] } as BookingSnapshot;
}

function parseBooking(value: unknown): Booking | null {
  if (!isRecord(value)) return null;
  const id = string(value.id);
  const offerId = string(value.offer_id);
  const status = string(value.status);
  const version = integer(value.version);
  const snapshot = parseSnapshot(value.snapshot);
  if (
    !id || !offerId || !UUID.test(id) || !UUID.test(offerId) || version === null || !snapshot
    || !(["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED"] as string[]).includes(status ?? "")
  ) return null;
  return { id, offerId, status: status as BookingStatus, version, snapshot };
}

async function request<T>(
  fetcher: Fetcher,
  apiOrigin: URL,
  path: string,
  parse: (value: unknown) => T | null,
  init: RequestInit = {},
): Promise<BookingApiResult<T>> {
  try {
    const response = await fetcher(new URL(path, apiOrigin), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", ...init.headers },
      ...init,
    });
    const body = await json(response);
    if (!response.ok) return { ok: false, status: response.status, code: errorCode(body) };
    const value = parse(body);
    return value === null
      ? { ok: false, status: response.status, code: "unexpected_response" }
      : { ok: true, value };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

function mutation(body: unknown, operationId: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
    body: JSON.stringify(body),
  };
}

export function isOpaqueUuid(value: string): boolean {
  return UUID.test(value);
}

export function bookingErrorKey(code: string):
  | "sessionExpired" | "permission" | "stale" | "conflict" | "unavailable" | "notFound" | "invalidForm" | "failed" {
  if (code === "authentication_required") return "sessionExpired";
  if (code === "capability_required") return "permission";
  if (code === "offer_changed") return "stale";
  if (["version_conflict", "booking_overlap", "invalid_booking_transition", "idempotency_conflict"].includes(code)) return "conflict";
  if (["offer_unavailable", "booking_time_elapsed"].includes(code)) return "unavailable";
  if (["tutor_offer_not_found", "booking_not_found"].includes(code)) return "notFound";
  if (code === "invalid_request") return "invalidForm";
  return "failed";
}

export function snapshotTimeZone(snapshot: BookingSnapshot, role: BookingRole): string {
  return role === "tutor" ? snapshot.tutorTimeZone : snapshot.studentTimeZone;
}

export function browserTimeZone(
  resolved = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  if (!resolved) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: resolved }).format(0);
    return resolved;
  } catch {
    return null;
  }
}

export function toOffsetRfc3339(localValue: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  if (Number.isNaN(date.valueOf())) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${localValue}:00${sign}${hours}:${minutes}`;
}

export function formatBookingTime(language: Language, value: string, timeZone: string): string {
  const locale = language === "uk" ? "uk-UA" : "ru-RU";
  try {
    return `${new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value))} (${timeZone})`;
  } catch {
    return `${new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} (UTC)`;
  }
}

export function formatBookingMoney(language: Language, mode: PaymentMode, amountMinor: number, currency: string | null): string {
  if (mode === "FREE") return "FREE";
  if (!currency) return "—";
  const locale = language === "uk" ? "uk-UA" : "ru-RU";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

export function listOwnOffers(fetcher: Fetcher, origin: URL) {
  return request(fetcher, origin, "/api/v1/tutor-offers/me", (value) => {
    if (!Array.isArray(value)) return null;
    const offers = value.map(parseOffer);
    return offers.every(Boolean) ? offers as TutorOffer[] : null;
  });
}

export function readOffer(fetcher: Fetcher, origin: URL, id: string) {
  return request(fetcher, origin, `/api/v1/tutor-offers/${id}`, parseOffer);
}

export function createOffer(fetcher: Fetcher, origin: URL, input: OfferWriteInput, operationId: string) {
  return request(fetcher, origin, "/api/v1/tutor-offers", parseOffer, mutation({
    title: input.title,
    starts_at: input.startsAt,
    time_zone: input.timeZone,
    duration_minutes: input.durationMinutes,
    minimum_notice_minutes: input.minimumNoticeMinutes,
    payment_mode: input.paymentMode,
    amount_minor: input.amountMinor,
    currency: input.currency,
  }, operationId));
}

export function transitionOffer(fetcher: Fetcher, origin: URL, offer: TutorOffer, action: "publish" | "retire", operationId: string) {
  return request(fetcher, origin, `/api/v1/tutor-offers/${offer.id}/${action}`, parseOffer, mutation({ expected_version: offer.version }, operationId));
}

export function requestBooking(fetcher: Fetcher, origin: URL, offer: TutorOffer, timeZone: string, operationId: string) {
  return request(fetcher, origin, `/api/v1/tutor-offers/${offer.id}/bookings`, parseBooking, mutation({
    observed_offer_version: offer.version,
    student_time_zone: timeZone,
  }, operationId));
}

export function listBookings(fetcher: Fetcher, origin: URL, role: BookingRole) {
  return request(fetcher, origin, `/api/v1/bookings/me?role=${role}`, (value) => {
    if (!Array.isArray(value)) return null;
    const bookings = value.map(parseBooking);
    return bookings.every(Boolean) ? bookings as Booking[] : null;
  });
}

export function transitionBooking(fetcher: Fetcher, origin: URL, booking: Booking, action: "accept" | "decline" | "cancel", operationId: string) {
  return request(fetcher, origin, `/api/v1/bookings/${booking.id}/${action}`, parseBooking, mutation({ expected_version: booking.version }, operationId));
}
