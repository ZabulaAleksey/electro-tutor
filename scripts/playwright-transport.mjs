export const DOWNLOAD_SPEC = "**/circuit-parallel.spec.ts";

// Download.path is only used by these four top-level JSON round-trip cases.
// Keep the file identity in testMatch and the exact case identity in grep so
// the remaining gesture/equivalent cases stay on the canonical remote browser.
export const DOWNLOAD_CASE_TITLES = [
  "parallel section R previews, commits atomically and survives JSON reload",
  "parallel section L previews, commits atomically and survives JSON reload",
  "parallel section R-L previews, commits atomically and survives JSON reload",
  "parallel section whole R-L-C previews, commits atomically and survives JSON reload",
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const DOWNLOAD_CASE_GREP = new RegExp(`(?:^|\\s)circuit-parallel\\.spec\\.ts\\s+(?:${DOWNLOAD_CASE_TITLES.map(escapeRegExp).join("|")})$`);

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
      testIgnore: sharedTestIgnore,
      grepInvert: DOWNLOAD_CASE_GREP,
      use: {
        ...desktopUse,
        connectOptions: { wsEndpoint, exposeNetwork: connectOptions.exposeNetwork || "<loopback>", ...(connectOptions.headers ? { headers: connectOptions.headers } : {}) },
      },
    },
    {
      name: "chromium-local-downloads",
      testMatch: [DOWNLOAD_SPEC],
      grep: DOWNLOAD_CASE_GREP,
      use: { ...desktopUse, connectOptions: undefined },
    },
  ];
}

export default clearAutoConnectEnvironment;
