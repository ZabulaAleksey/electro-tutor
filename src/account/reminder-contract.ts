import { resolveLocalApiOrigin } from "./profile-contract";

export interface ReminderSettings {
  timeZone: string | null;
  remind24h: boolean;
  remind1h: boolean;
  remind15m: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export type ReminderResult =
  | { ok: true; value: ReminderSettings }
  | { ok: false; status: number; code: string };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const wallTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validIanaTimeZone(value: string): boolean {
  if (value !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function parseReminderSettings(value: unknown): ReminderSettings | null {
  if (!record(value)
    || (value.time_zone !== null && (typeof value.time_zone !== "string" || !validIanaTimeZone(value.time_zone)))
    || typeof value.remind_24h !== "boolean"
    || typeof value.remind_1h !== "boolean"
    || typeof value.remind_15m !== "boolean"
    || typeof value.quiet_hours_enabled !== "boolean"
    || (value.quiet_hours_start !== null && !wallTime(value.quiet_hours_start))
    || (value.quiet_hours_end !== null && !wallTime(value.quiet_hours_end))) return null;
  if (value.quiet_hours_enabled && (!value.quiet_hours_start || !value.quiet_hours_end
    || value.quiet_hours_start === value.quiet_hours_end)) return null;
  return {
    timeZone: value.time_zone as string | null,
    remind24h: value.remind_24h,
    remind1h: value.remind_1h,
    remind15m: value.remind_15m,
    quietHoursEnabled: value.quiet_hours_enabled,
    quietHoursStart: value.quiet_hours_start as string | null,
    quietHoursEnd: value.quiet_hours_end as string | null,
  };
}

async function request(
  fetcher: Fetcher, origin: URL, init: RequestInit,
): Promise<ReminderResult> {
  try {
    const response = await fetcher(new URL("/api/v1/reminder-settings/me", origin), {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...init,
    });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const code = record(body) && record(body.error) && typeof body.error.code === "string"
        ? body.error.code : "unexpected_response";
      return { ok: false, status: response.status, code };
    }
    const value = parseReminderSettings(body);
    return value ? { ok: true, value }
      : { ok: false, status: response.status, code: "unexpected_response" };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

export function fetchReminderSettings(
  fetcher: Fetcher, origin: URL, signal?: AbortSignal,
): Promise<ReminderResult> {
  return request(fetcher, origin, { signal });
}

export function saveReminderSettings(
  fetcher: Fetcher, origin: URL, value: ReminderSettings,
): Promise<ReminderResult> {
  return request(fetcher, origin, {
    method: "PUT",
    body: JSON.stringify({
      time_zone: value.timeZone,
      remind_24h: value.remind24h,
      remind_1h: value.remind1h,
      remind_15m: value.remind15m,
      quiet_hours_enabled: value.quietHoursEnabled,
      quiet_hours_start: value.quietHoursEnabled ? value.quietHoursStart : null,
      quiet_hours_end: value.quietHoursEnabled ? value.quietHoursEnd : null,
    }),
  });
}

export { resolveLocalApiOrigin };
