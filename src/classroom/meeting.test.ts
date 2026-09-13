import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JitsiMeetingAdapter, loadJitsiConstructor } from "./jitsi-meeting-adapter";
import {
  canonicalMeetingUrl,
  disposeMeetingSession,
  hasWhiteboard,
  MEETING_DISPLAY_NAME_MAX_LENGTH,
  MeetingJoinGate,
  normalizeMeetingDisplayName,
  type MeetingProvider,
  type MeetingSession,
} from "./meeting";

type Harness = {
  provider: MeetingProvider;
  commands: string[];
  dispose: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>[];
};

function createFakeHarness(): Harness {
  const commands: string[] = [];
  const dispose = vi.fn();
  const options: Record<string, unknown>[] = [];
  const session: MeetingSession = {
    capabilities: { whiteboard: true },
    openWhiteboard: () => commands.push("whiteboard"),
    dispose,
  };
  return {
    provider: { join: async () => session },
    commands,
    dispose,
    options,
  };
}

function createJitsiHarness(): Harness {
  const commands: string[] = [];
  const dispose = vi.fn();
  const options: Record<string, unknown>[] = [];

  class InjectedJitsiApi {
    constructor(_domain: string, currentOptions: Record<string, unknown>) {
      options.push(currentOptions);
    }

    executeCommand(command: string) {
      commands.push(command === "toggleWhiteboard" ? "whiteboard" : command);
    }

    dispose() {
      dispose();
    }
  }

  return {
    provider: new JitsiMeetingAdapter({ loadConstructor: async () => InjectedJitsiApi }),
    commands,
    dispose,
    options,
  };
}

for (const [name, createHarness] of [
  ["fake", createFakeHarness],
  ["jitsi adapter", createJitsiHarness],
] as const) {
  describe(`${name} meeting contract`, () => {
    it("joins, advertises whiteboard, translates the command and disposes", async () => {
      const harness = createHarness();
      const session = await harness.provider.join({
        room: "room-42",
        displayName: " Ada ",
        host: {} as HTMLElement,
      });

      expect(session.capabilities).toEqual({ whiteboard: true });
      session.openWhiteboard();
      session.dispose();

      expect(harness.commands).toEqual(["whiteboard"]);
      expect(harness.dispose).toHaveBeenCalledOnce();
    });
  });
}

describe("Jitsi meeting adapter", () => {
  it("preserves the public MVP join options and makes dispose idempotent", async () => {
    const harness = createJitsiHarness();
    const host = {} as HTMLElement;
    const session = await harness.provider.join({ room: "lesson", displayName: " Ada ", host });

    expect(harness.options).toEqual([{
      roomName: "potential-lesson",
      parentNode: host,
      width: "100%",
      height: "100%",
      userInfo: { displayName: "Ada" },
      configOverwrite: {
        prejoinPageEnabled: true,
        startWithAudioMuted: true,
        startWithVideoMuted: true,
      },
    }]);
    session.dispose();
    session.dispose();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it("normalizes load, join and command failures", async () => {
    const request = { room: "lesson", displayName: "", host: {} as HTMLElement };
    const unavailable = new JitsiMeetingAdapter({
      loadConstructor: async () => { throw new Error("offline"); },
    });
    await expect(unavailable.join(request)).rejects.toMatchObject({
      name: "MeetingError",
      code: "provider-unavailable",
    });

    class FailedJoin {
      constructor() {
        throw new Error("join");
      }
      executeCommand() {}
      dispose() {}
    }
    const joinFailure = new JitsiMeetingAdapter({ loadConstructor: async () => FailedJoin });
    await expect(joinFailure.join(request)).rejects.toMatchObject({
      code: "join-failed",
    });

    class FailedCommand {
      executeCommand() { throw new Error("command"); }
      dispose() {}
    }
    const commandFailure = new JitsiMeetingAdapter({ loadConstructor: async () => FailedCommand });
    const session = await commandFailure.join(request);
    expect(() => session.openWhiteboard()).toThrow("command-failed");
  });

  it("falls back to guaranteed host teardown when vendor disposal fails", async () => {
    const replaceChildren = vi.fn();
    class FailedVendorDispose {
      executeCommand() {}
      dispose() {
        throw new Error("busy");
      }
    }
    const adapter = new JitsiMeetingAdapter({ loadConstructor: async () => FailedVendorDispose });
    const session = await adapter.join({
      room: "lesson",
      displayName: "Ada",
      host: { replaceChildren } as unknown as HTMLElement,
    });

    expect(() => session.dispose()).not.toThrow();
    session.dispose();
    expect(replaceChildren).toHaveBeenCalledOnce();
  });

  it("keeps vendor details out of the React consumer", () => {
    const classroomPath = fileURLToPath(new URL("../components/Classroom.tsx", import.meta.url));
    const source = readFileSync(classroomPath, "utf8");

    for (const forbidden of [
      "Jitsi",
      "meet.jit.si",
      "external_api.js",
      "toggleWhiteboard",
      "executeCommand",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("createMeetingProvider");
  });
});

describe("meeting consumer boundary", () => {
  it("normalizes bounded display names before persistence or provider use", () => {
    const value = `\u0000  Ada\n${"x".repeat(120)}  `;
    const normalized = normalizeMeetingDisplayName(value);

    expect(Array.from(normalized).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })).toBe(true);
    expect(normalized).toHaveLength(MEETING_DISPLAY_NAME_MAX_LENGTH);
    expect(normalized.startsWith("Adax")).toBe(true);
  });

  it("creates an invite URL with only the allowlisted room parameter", () => {
    const invite = canonicalMeetingUrl(
      "https://example.test/base/classroom?room=old&token=secret&name=Ada#private",
      "lesson-42",
    );

    expect(invite.toString()).toBe("https://example.test/base/classroom?room=lesson-42");
  });

  it("derives optional whiteboard UI from provider capability", () => {
    const withoutWhiteboard: MeetingSession = {
      capabilities: { whiteboard: false },
      openWhiteboard() {},
      dispose() {},
    };
    expect(hasWhiteboard(null)).toBe(false);
    expect(hasWhiteboard(withoutWhiteboard)).toBe(false);
    expect(hasWhiteboard({ ...withoutWhiteboard, capabilities: { whiteboard: true } })).toBe(true);
  });

  it("retries bounded disposal for a session that resolves after invalidation", () => {
    let attempts = 0;
    const dispose = vi.fn(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
    });
    const gate = new MeetingJoinGate();
    const generation = gate.begin();
    gate.invalidate();

    expect(gate.accept(generation, {
      capabilities: { whiteboard: false },
      openWhiteboard() {},
      dispose,
    })).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("reports a persistent provider cleanup failure after bounded attempts", () => {
    const dispose = vi.fn(() => { throw new Error("persistent"); });
    expect(disposeMeetingSession({
      capabilities: { whiteboard: false },
      openWhiteboard() {},
      dispose,
    })).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});

type FakeScript = {
  src: string;
  async: boolean;
  dataset: Record<string, string>;
  isConnected: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  dispatch(type: string): void;
  remove(): void;
};

function createFakeScript(onRemove: () => void): FakeScript {
  const listeners = new Map<string, Set<() => void>>();
  return {
    src: "",
    async: false,
    dataset: {},
    isConnected: false,
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    remove() {
      this.isConnected = false;
      onRemove();
    },
  };
}

describe("Jitsi script loader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("times out, removes the failed script and permits a clean retry", async () => {
    vi.useFakeTimers();
    let currentScript: FakeScript | null = null;
    const created: FakeScript[] = [];
    const fakeWindow: { JitsiMeetExternalAPI?: new () => never } = {};
    const fakeDocument = {
      querySelector: () => currentScript,
      createElement: () => {
        const script = createFakeScript(() => {
          if (currentScript === script) currentScript = null;
        });
        created.push(script);
        return script;
      },
      head: {
        append(script: FakeScript) {
          script.isConnected = true;
          currentScript = script;
        },
      },
    };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);

    const first = loadJitsiConstructor("https://meet.test/api.js", 10);
    const firstExpectation = expect(first).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10);
    await firstExpectation;
    expect(currentScript).toBeNull();

    const second = loadJitsiConstructor("https://meet.test/api.js", 10);
    expect(created).toHaveLength(2);
    class LoadedApi {
      executeCommand() {}
      dispose() {}
    }
    fakeWindow.JitsiMeetExternalAPI = LoadedApi as never;
    created[1].dispatch("load");
    await expect(second).resolves.toBe(LoadedApi);
  });

  it("replaces an already-settled script when the constructor is absent", async () => {
    let removed = false;
    const settled = createFakeScript(() => { removed = true; });
    settled.dataset.jitsiApiState = "loaded";
    settled.isConnected = true;
    const created = createFakeScript(() => {});
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      querySelector: () => settled,
      createElement: () => created,
      head: { append(script: FakeScript) { script.isConnected = true; } },
    });

    const replacement = loadJitsiConstructor("https://meet.test/api.js", 10);
    const replacementExpectation = expect(replacement).rejects.toThrow("failed to load");

    expect(removed).toBe(true);
    expect(created.isConnected).toBe(true);
    created.dispatch("error");
    await replacementExpectation;
  });

  it("recovers after script load completes without publishing a constructor", async () => {
    let currentScript: FakeScript | null = null;
    const created: FakeScript[] = [];
    const fakeWindow: { JitsiMeetExternalAPI?: new () => never } = {};
    const fakeDocument = {
      querySelector: () => currentScript,
      createElement: () => {
        const script = createFakeScript(() => {
          if (currentScript === script) currentScript = null;
        });
        created.push(script);
        return script;
      },
      head: { append(script: FakeScript) { script.isConnected = true; currentScript = script; } },
    };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);

    const first = loadJitsiConstructor("https://meet.test/api.js", 50);
    const firstExpectation = expect(first).rejects.toThrow("constructor is unavailable");
    created[0].dispatch("load");
    await firstExpectation;
    expect(currentScript).toBeNull();

    const second = loadJitsiConstructor("https://meet.test/api.js", 50);
    class LoadedApi {
      executeCommand() {}
      dispose() {}
    }
    fakeWindow.JitsiMeetExternalAPI = LoadedApi as never;
    created[1].dispatch("load");
    await expect(second).resolves.toBe(LoadedApi);
  });
});
