import { describe, expect, it } from "vitest";
import { resolvePnpmInvocation } from "./full-verify.mjs";

describe("full-verify pnpm launcher", () => {
  it("runs a JavaScript pnpm entrypoint through the current Node", () => {
    const invocation = resolvePnpmInvocation({ entrypoint: "C:/cache/pnpm.cjs", platform: "win32" });
    expect(invocation.argsPrefix).toEqual(["C:/cache/pnpm.cjs"]);
    expect(invocation.shell).toBe(false);
  });

  it("executes the native pnpm/setup binary directly on Linux", () => {
    expect(resolvePnpmInvocation({ entrypoint: "/opt/pnpm/bin/pnpm", platform: "linux" }))
      .toEqual({ command: "/opt/pnpm/bin/pnpm", argsPrefix: [], shell: false });
  });

  it("uses the Windows shell only for a cmd shim", () => {
    expect(resolvePnpmInvocation({ entrypoint: "C:/tools/pnpm.cmd", platform: "win32" }))
      .toEqual({ command: "C:/tools/pnpm.cmd", argsPrefix: [], shell: true });
  });

  it("falls back to the platform pnpm command when npm_execpath points at Node", () => {
    expect(resolvePnpmInvocation({ entrypoint: "C:/Program Files/nodejs/node.exe", platform: "win32" }))
      .toEqual({ command: "pnpm.cmd", argsPrefix: [], shell: true });
  });
});
