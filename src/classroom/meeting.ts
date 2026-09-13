export type MeetingCapabilities = Readonly<{
  whiteboard: boolean;
}>;

export type MeetingJoinRequest = Readonly<{
  room: string;
  displayName: string;
  host: HTMLElement;
}>;

export interface MeetingSession {
  readonly capabilities: MeetingCapabilities;
  openWhiteboard(): void;
  dispose(): void;
}

export interface MeetingProvider {
  join(request: MeetingJoinRequest): Promise<MeetingSession>;
}

export type MeetingErrorCode =
  | "provider-unavailable"
  | "join-failed"
  | "command-failed"
  | "dispose-failed";

export class MeetingError extends Error {
  readonly code: MeetingErrorCode;

  constructor(code: MeetingErrorCode) {
    super(code);
    this.name = "MeetingError";
    this.code = code;
  }
}

export const MEETING_DISPLAY_NAME_MAX_LENGTH = 80;

export function normalizeMeetingDisplayName(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("")
    .trim()
    .slice(0, MEETING_DISPLAY_NAME_MAX_LENGTH);
}

export function canonicalMeetingUrl(currentUrl: string, room: string): URL {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", room);
  return url;
}

export function hasWhiteboard(session: MeetingSession | null): boolean {
  return session?.capabilities.whiteboard === true;
}

export function disposeMeetingSession(session: MeetingSession, attempts = 2): boolean {
  const boundedAttempts = Math.max(1, Math.min(3, Math.trunc(attempts)));
  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    try {
      session.dispose();
      return true;
    } catch {
      // A transient provider failure may recover on the next bounded attempt.
    }
  }
  return false;
}

export class MeetingJoinGate {
  #generation = 0;

  begin(): number {
    this.#generation += 1;
    return this.#generation;
  }

  invalidate(): void {
    this.#generation += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.#generation;
  }

  accept(generation: number, session: MeetingSession): boolean {
    if (this.isCurrent(generation)) return true;
    disposeMeetingSession(session);
    return false;
  }
}
