import { describe, expect, it, vi } from "vitest";
import { getLocale } from "../i18n";
import {
  listNotifications,
  markNotificationRead,
  notificationBookingHref,
  parseNotification,
  unreadNotificationCount,
} from "./notification-contract";

const id = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const origin = new URL("http://127.0.0.1:8000");
const raw = {
  id,
  type: "booking.accepted",
  booking_id: bookingId,
  created_at: "2026-09-28T10:00:00Z",
  expires_at: "2026-10-28T10:00:00Z",
  read_at: null,
};

describe("private notification browser contract", () => {
  it("accepts only a known structured type and typed internal booking target", () => {
    const item = parseNotification(raw);
    expect(item).not.toBeNull();
    if (!item) return;
    expect(notificationBookingHref("ru", item)).toBe(
      `/ru/lesson/#booking=${bookingId}`,
    );
    expect(notificationBookingHref("uk", item)).toBe(
      `/uk/lesson/#booking=${bookingId}`,
    );
    expect(parseNotification({ ...raw, type: "external.redirect", url: "https://evil.invalid" })).toBeNull();
    expect(parseNotification({ ...raw, booking_id: "https://evil.invalid" })).toBeNull();
    expect(getLocale("ru").notifications.accepted).not.toBe(getLocale("uk").notifications.accepted);
  });

  it("uses credentialed no-store reads and rejects malformed server payloads", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBeDefined();
      expect(init).toBeDefined();
      return new Response(JSON.stringify({ items: [raw], limit: 20, offset: 0 }), { status: 200 });
    });
    const listed = await listNotifications(fetcher, origin);
    expect(listed.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:8000/api/v1/notifications?limit=20&offset=0");
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");

    const malformed = await listNotifications(async () =>
      new Response(JSON.stringify({ items: [{ ...raw, booking_id: "foreign" }], limit: 20, offset: 0 })), origin);
    expect(malformed).toEqual({ ok: false, status: 200, code: "unexpected_response" });
    expect((await unreadNotificationCount(async () =>
      new Response(JSON.stringify({ count: 3 })), origin))).toEqual({ ok: true, value: 3 });
  });

  it("marks only a canonical item ID and requires a successful empty 204", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBeDefined();
      expect(init).toBeDefined();
      return new Response(null, { status: 204 });
    });
    expect(await markNotificationRead(fetcher, origin, "https://evil.invalid"))
      .toEqual({ ok: false, status: 0, code: "invalid_id" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await markNotificationRead(fetcher, origin, id)).toEqual({ ok: true, value: true });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `http://127.0.0.1:8000/api/v1/notifications/${id}/read`,
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
  });
});
