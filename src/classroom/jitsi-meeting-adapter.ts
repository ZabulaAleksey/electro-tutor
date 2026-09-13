import {
  MeetingError,
  type MeetingJoinRequest,
  type MeetingProvider,
  type MeetingSession,
  normalizeMeetingDisplayName,
} from "./meeting";

type JitsiApi = {
  executeCommand(command: string, ...args: unknown[]): void;
  dispose(): void;
};

type JitsiConstructor = new (
  domain: string,
  options: Record<string, unknown>,
) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

type JitsiAdapterDependencies = Readonly<{
  loadConstructor?: () => Promise<JitsiConstructor>;
  domain?: string;
  scriptUrl?: string;
  loadTimeoutMs?: number;
}>;

const WHITEBOARD_CAPABILITIES = Object.freeze({ whiteboard: true });

function clearProviderHost(host: HTMLElement): boolean {
  try {
    host.replaceChildren();
    return true;
  } catch {
    return false;
  }
}

export class JitsiMeetingAdapter implements MeetingProvider {
  readonly #domain: string;
  readonly #loadConstructor: () => Promise<JitsiConstructor>;

  constructor(dependencies: JitsiAdapterDependencies = {}) {
    this.#domain = dependencies.domain ?? "meet.jit.si";
    this.#loadConstructor = dependencies.loadConstructor
      ?? (() => loadJitsiConstructor(
        dependencies.scriptUrl ?? "https://meet.jit.si/external_api.js",
        dependencies.loadTimeoutMs ?? 15_000,
      ));
  }

  async join(request: MeetingJoinRequest): Promise<MeetingSession> {
    let Constructor: JitsiConstructor;
    try {
      Constructor = await this.#loadConstructor();
    } catch {
      throw new MeetingError("provider-unavailable");
    }

    let api: JitsiApi;
    try {
      api = new Constructor(this.#domain, {
        roomName: `potential-${request.room}`,
        parentNode: request.host,
        width: "100%",
        height: "100%",
        userInfo: { displayName: normalizeMeetingDisplayName(request.displayName) || undefined },
        configOverwrite: {
          prejoinPageEnabled: true,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
        },
      });
    } catch {
      clearProviderHost(request.host);
      throw new MeetingError("join-failed");
    }

    let disposed = false;
    return {
      capabilities: WHITEBOARD_CAPABILITIES,
      openWhiteboard() {
        try {
          api.executeCommand("toggleWhiteboard");
        } catch {
          throw new MeetingError("command-failed");
        }
      },
      dispose() {
        if (disposed) return;
        try {
          api.dispose();
          disposed = true;
        } catch {
          if (clearProviderHost(request.host)) {
            disposed = true;
          } else {
            throw new MeetingError("dispose-failed");
          }
        }
      },
    };
  }
}

export function loadJitsiConstructor(
  scriptUrl: string,
  timeoutMs = 15_000,
): Promise<JitsiConstructor> {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve(window.JitsiMeetExternalAPI);
      return;
    }

    let script = document.querySelector<HTMLScriptElement>("script[data-jitsi-api]");
    if (script && script.dataset.jitsiApiState && script.dataset.jitsiApiState !== "loading") {
      script.remove();
      script = null;
    }

    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (script) {
        script.dataset.jitsiApiState = "failed";
        script.remove();
      }
      cleanup();
      reject(error);
    };
    const handleLoad = () => {
      if (script) script.dataset.jitsiApiState = "loaded";
      if (window.JitsiMeetExternalAPI) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(window.JitsiMeetExternalAPI);
      } else {
        fail(new Error("Jitsi constructor is unavailable after script load"));
      }
    };
    const handleError = () => fail(new Error("Jitsi script failed to load"));
    const cleanup = () => {
      clearTimeout(timer);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };

    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.dataset.jitsiApi = "true";
      script.dataset.jitsiApiState = "loading";
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    const timer = setTimeout(
      () => fail(new Error("Jitsi script load timed out")),
      Math.max(1, timeoutMs),
    );
    if (!script.isConnected) document.head.append(script);
  });
}
