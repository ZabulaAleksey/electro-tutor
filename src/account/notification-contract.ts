import { isOpaqueUuid } from "./booking-contract";
import type { Language } from "../types";

export interface NotificationItem {
  id: string;
  type: "booking.accepted";
  bookingId: string;
  createdAt: string;
  expiresAt: string;
  readAt: string | null;
}

export type NotificationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseNotification(value: unknown): NotificationItem | null {
  if (!record(value)
    || typeof value.id !== "string" || !isOpaqueUuid(value.id)
    || value.type !== "booking.accepted"
    || typeof value.booking_id !== "string" || !isOpaqueUuid(value.booking_id)
    || !timestamp(value.created_at) || !timestamp(value.expires_at)
    || (value.read_at !== null && !timestamp(value.read_at))) return null;
  return {
    id: value.id,
    type: value.type,
    bookingId: value.booking_id,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    readAt: value.read_at,
  };
}

async function request<T>(
  fetcher: Fetcher,
  origin: URL,
  path: string,
  parse: (value: unknown) => T | null,
  init: RequestInit,
): Promise<NotificationResult<T>> {
  try {
    const response = await fetcher(new URL(path, origin), {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...init,
    });
    if (response.status === 204) {
      const value = parse(null);
      return value === null
        ? { ok: false, status: 204, code: "unexpected_response" }
        : { ok: true, value };
    }
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const code = record(body) && record(body.error) && typeof body.error.code === "string"
        ? body.error.code : "unexpected_response";
      return { ok: false, status: response.status, code };
    }
    const value = parse(body);
    return value === null
      ? { ok: false, status: response.status, code: "unexpected_response" }
      : { ok: true, value };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

export function listNotifications(
  fetcher: Fetcher, origin: URL, offset = 0, signal?: AbortSignal,
): Promise<NotificationResult<NotificationItem[]>> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) {
    return Promise.resolve({ ok: false, status: 0, code: "invalid_page" });
  }
  return request(fetcher, origin, `/api/v1/notifications?limit=20&offset=${offset}`, (body) => {
    if (!record(body) || !Array.isArray(body.items)
      || body.limit !== 20 || body.offset !== offset) return null;
    const items = body.items.map(parseNotification);
    return items.every((item): item is NotificationItem => item !== null) ? items : null;
  }, { signal });
}

export function unreadNotificationCount(
  fetcher: Fetcher, origin: URL, signal?: AbortSignal,
): Promise<NotificationResult<number>> {
  return request(fetcher, origin, "/api/v1/notifications/unread-count", (body) => (
    record(body) && Number.isSafeInteger(body.count) && (body.count as number) >= 0
      ? body.count as number : null
  ), { signal });
}

export function markNotificationRead(
  fetcher: Fetcher, origin: URL, id: string,
): Promise<NotificationResult<true>> {
  if (!isOpaqueUuid(id)) {
    return Promise.resolve({ ok: false, status: 0, code: "invalid_id" });
  }
  return request(fetcher, origin, `/api/v1/notifications/${id}/read`,
    (value) => value === null ? true : null, { method: "POST" });
}

export function notificationBookingHref(language: Language, item: NotificationItem): string {
  return `/${language}/lesson/#booking=${item.bookingId}`;
}
