import { describe, expect, it, vi } from "vitest";
import {
  fetchReminderSettings, parseReminderSettings, saveReminderSettings, validIanaTimeZone,
} from "./reminder-contract";

const origin = new URL("http://127.0.0.1:8000");
const settings = {
  time_zone: "Europe/Kyiv",
  remind_24h: true,
  remind_1h: true,
  remind_15m: false,
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

describe("ET-14.2 account reminder contract", () => {
  it("requires a real IANA timezone and strict settings shape", () => {
    expect(validIanaTimeZone("Europe/Kyiv")).toBe(true);
    expect(validIanaTimeZone("America/New_York")).toBe(true);
    expect(validIanaTimeZone("https://evil.invalid")).toBe(false);
    expect(validIanaTimeZone("+03:00")).toBe(false);
    expect(parseReminderSettings({ ...settings, time_zone: null })?.timeZone).toBeNull();
    expect(parseReminderSettings({ ...settings, quiet_hours_enabled: true,
      quiet_hours_start: "22:00", quiet_hours_end: "08:00" })?.quietHoursEnabled).toBe(true);
    expect(parseReminderSettings({ ...settings, quiet_hours_enabled: true })).toBeNull();
    expect(parseReminderSettings({ ...settings, remind_15m: "false" })).toBeNull();
  });

  it("uses only own credentialed endpoint and serializes independent toggles", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify(settings), { status: 200 });
    });
    const loaded = await fetchReminderSettings(fetcher, origin);
    expect(loaded.ok).toBe(true);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://127.0.0.1:8000/api/v1/reminder-settings/me");
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(fetcher.mock.calls[0]?.[1]?.cache).toBe("no-store");
    if (!loaded.ok) return;
    await saveReminderSettings(fetcher, origin, { ...loaded.value,
      remind15m: true, quietHoursEnabled: true,
      quietHoursStart: "22:00", quietHoursEnd: "08:00" });
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      time_zone: "Europe/Kyiv", remind_15m: true,
      quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "08:00",
    });
  });

  it("rejects malformed successes and exposes server failures without using their message", async () => {
    expect(await fetchReminderSettings(async () => new Response(JSON.stringify({ ...settings,
      time_zone: "Invalid/Zone" }), { status: 200 }), origin)).toEqual({
      ok: false, status: 200, code: "unexpected_response",
    });
    expect(await fetchReminderSettings(async () => new Response(JSON.stringify({
      error: { code: "authentication_required", message: "private detail" },
    }), { status: 401 }), origin)).toEqual({
      ok: false, status: 401, code: "authentication_required",
    });
  });
});
