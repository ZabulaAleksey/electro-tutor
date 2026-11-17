export const DOWNLOAD_SPEC = "**/circuit-parallel.spec.ts";

export async function clearAutoConnectEnvironment() {
  // Playwright's built-in connectOptions fixture gives PW_TEST_CONNECT_WS_ENDPOINT
  // precedence over project options. Projects below carry the explicit remote
  // endpoint, so clear the ambient override before worker fixtures are created;
  // this leaves the local-download project launchable in the same invocation.
  if (process.env.PW_TEST_CONNECT_WS_ENDPOINT) process.env.ELECTROTUTOR_REMOTE_WS_ENDPOINT = process.env.PW_TEST_CONNECT_WS_ENDPOINT;
  if (process.env.PW_TEST_CONNECT_HEADERS) process.env.ELECTROTUTOR_REMOTE_WS_HEADERS = process.env.PW_TEST_CONNECT_HEADERS;
  if (process.env.PW_TEST_CONNECT_EXPOSE_NETWORK) process.env.ELECTROTUTOR_REMOTE_WS_EXPOSE_NETWORK = process.env.PW_TEST_CONNECT_EXPOSE_NETWORK;
  delete process.env.PW_TEST_CONNECT_WS_ENDPOINT;
  delete process.env.PW_TEST_CONNECT_HEADERS;
  delete process.env.PW_TEST_CONNECT_EXPOSE_NETWORK;
}

export function makeTransportProjects(wsEndpoint, desktopUse, sharedTestIgnore = [], connectOptions = {}) {
  if (!wsEndpoint) return [{ name: "chromium", use: { ...desktopUse } }];

  return [
    {
      name: "chromium",
      testIgnore: [...sharedTestIgnore, DOWNLOAD_SPEC],
      use: {
        ...desktopUse,
        connectOptions: { wsEndpoint, exposeNetwork: connectOptions.exposeNetwork || "<loopback>", ...(connectOptions.headers ? { headers: connectOptions.headers } : {}) },
      },
    },
    {
      name: "chromium-local-downloads",
      testMatch: [DOWNLOAD_SPEC],
      use: { ...desktopUse, connectOptions: undefined },
    },
  ];
}

export default clearAutoConnectEnvironment;
