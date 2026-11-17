import { describe, expect, it } from "vitest";
import { clearAutoConnectEnvironment, DOWNLOAD_SPEC, makeTransportProjects } from "../../scripts/playwright-transport.mjs";

const desktopUse = { browserName: "chromium" };

describe("Playwright browser transport partition", () => {
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
      testIgnore: [DOWNLOAD_SPEC],
      use: { browserName: "chromium", connectOptions: { wsEndpoint: "ws://remote.invalid/playwright", exposeNetwork: "<loopback>" } },
    });
    expect(projects[1]).toEqual({
      name: "chromium-local-downloads",
      testMatch: [DOWNLOAD_SPEC],
      use: { ...desktopUse, connectOptions: undefined },
    });
    expect((projects[0] as { testIgnore: string[] }).testIgnore).toEqual((projects[1] as { testMatch: string[] }).testMatch);
    expect(projects[1].use.connectOptions).toBeUndefined();
  });

  it("retains the shared ignore contract on the remote side", () => {
    const shared = ["**/mvp-*.spec.ts", "**/education-release.spec.ts"];
    expect((makeTransportProjects("ws://remote.invalid/playwright", desktopUse, shared)[0] as { testIgnore: string[] }).testIgnore).toEqual([...shared, DOWNLOAD_SPEC]);
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
