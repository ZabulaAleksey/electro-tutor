import { describe, expect, it } from "vitest";
import {
  clearAutoConnectEnvironment,
  DOWNLOAD_CASE_GREP,
  DOWNLOAD_CASE_TITLES,
  DOWNLOAD_SPEC,
  makeTransportProjects,
} from "../../scripts/playwright-transport.mjs";

const desktopUse = { browserName: "chromium" };

describe("Playwright browser transport partition", () => {
  it("pins the independent four-case allowlist and its file-qualified grep", () => {
    expect(DOWNLOAD_CASE_TITLES).toEqual([
      "parallel section R previews, commits atomically and survives JSON reload",
      "parallel section L previews, commits atomically and survives JSON reload",
      "parallel section R-L previews, commits atomically and survives JSON reload",
      "parallel section whole R-L-C previews, commits atomically and survives JSON reload",
    ]);
    for (const title of DOWNLOAD_CASE_TITLES) {
      expect(DOWNLOAD_CASE_GREP.test(`chromium circuit-parallel.spec.ts ${title}`)).toBe(true);
      expect(DOWNLOAD_CASE_GREP.test(`chromium tests/e2e/other.spec.ts ${title}`)).toBe(false);
      expect(DOWNLOAD_CASE_GREP.test(`chromium nested/circuit-parallel.spec.ts ${title}`)).toBe(false);
      expect(DOWNLOAD_CASE_GREP.test(`chromium circuit-parallel.spec.ts unrelated ${title}`)).toBe(false);
    }
  });

  it("keeps the default no-endpoint contract as one local chromium project", () => {
    expect(makeTransportProjects(undefined, desktopUse)).toEqual([
      { name: "chromium", use: desktopUse },
    ]);
  });

  it("partitions circuit downloads exactly once when the browser is remote", () => {
    const projects = makeTransportProjects("ws://remote.invalid/playwright", desktopUse);
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      name: "chromium",
      testIgnore: [],
      grepInvert: DOWNLOAD_CASE_GREP,
      use: { browserName: "chromium", connectOptions: { wsEndpoint: "ws://remote.invalid/playwright", exposeNetwork: "<loopback>" } },
    });
    expect(projects[1]).toEqual({
      name: "chromium-local-downloads",
      testMatch: [DOWNLOAD_SPEC],
      grep: DOWNLOAD_CASE_GREP,
      use: { ...desktopUse, connectOptions: undefined },
    });
    expect(DOWNLOAD_CASE_TITLES).toHaveLength(4);
    expect((projects[0] as { grepInvert: RegExp }).grepInvert).toEqual(DOWNLOAD_CASE_GREP);
    expect((projects[1] as { grep: RegExp }).grep).toEqual(DOWNLOAD_CASE_GREP);
    expect(projects[1].use.connectOptions).toBeUndefined();
  });

  it("retains the shared ignore contract on the remote side", () => {
    const shared = ["**/mvp-*.spec.ts", "**/education-release.spec.ts"];
    expect((makeTransportProjects("ws://remote.invalid/playwright", desktopUse, shared)[0] as { testIgnore: string[] }).testIgnore).toEqual(shared);
  });

  it("moves the ambient endpoint to an explicit project-owned value for worker reload", async () => {
    const oldEndpoint = process.env.PW_TEST_CONNECT_WS_ENDPOINT;
    const oldOwnedEndpoint = process.env.ELECTROTUTOR_REMOTE_WS_ENDPOINT;
    const oldOwnedHeaders = process.env.ELECTROTUTOR_REMOTE_WS_HEADERS;
    const oldOwnedExpose = process.env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK;
    const oldHeaders = process.env.PW_TEST_CONNECT_HEADERS;
    const oldExpose = process.env.PW_TEST_CONNECT_EXPOSE_NETWORK;
    try {
      process.env.PW_TEST_CONNECT_WS_ENDPOINT = "ws://remote.invalid/playwright";
      process.env.PW_TEST_CONNECT_HEADERS = "{\"x-test\":\"1\"}";
      process.env.PW_TEST_CONNECT_EXPOSE_NETWORK = "<loopback>";
      await clearAutoConnectEnvironment();
      expect(process.env.ELECTROTUTOR_REMOTE_WS_ENDPOINT).toBe("ws://remote.invalid/playwright");
      expect(process.env.ELECTROTUTOR_REMOTE_WS_HEADERS).toBe("{\"x-test\":\"1\"}");
      expect(process.env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK).toBe("<loopback>");
      expect(process.env.PW_TEST_CONNECT_WS_ENDPOINT).toBeUndefined();
      expect(process.env.PW_TEST_CONNECT_HEADERS).toBeUndefined();
      expect(process.env.PW_TEST_CONNECT_EXPOSE_NETWORK).toBeUndefined();
    } finally {
      if (oldEndpoint === undefined) delete process.env.PW_TEST_CONNECT_WS_ENDPOINT; else process.env.PW_TEST_CONNECT_WS_ENDPOINT = oldEndpoint;
      if (oldOwnedEndpoint === undefined) delete process.env.ELECTROTUTOR_REMOTE_WS_ENDPOINT; else process.env.ELECTROTUTOR_REMOTE_WS_ENDPOINT = oldOwnedEndpoint;
      if (oldOwnedHeaders === undefined) delete process.env.ELECTROTUTOR_REMOTE_WS_HEADERS; else process.env.ELECTROTUTOR_REMOTE_WS_HEADERS = oldOwnedHeaders;
      if (oldOwnedExpose === undefined) delete process.env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK; else process.env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK = oldOwnedExpose;
      if (oldHeaders === undefined) delete process.env.PW_TEST_CONNECT_HEADERS; else process.env.PW_TEST_CONNECT_HEADERS = oldHeaders;
      if (oldExpose === undefined) delete process.env.PW_TEST_CONNECT_EXPOSE_NETWORK; else process.env.PW_TEST_CONNECT_EXPOSE_NETWORK = oldExpose;
    }
  });
});
