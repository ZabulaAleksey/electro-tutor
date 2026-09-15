import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = 4322;
const baseURL = `http://${host}:${port}`;
const liveLessonSessionPhase =
  process.env.E2E_AUTH_PHASE === "lesson-session" &&
  process.env.E2E_SPEC === "tests/e2e/auth-lesson-session.spec.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  // The secret-bearing Session scenario is selected only by the authenticated
  // runner's required phase. Ordinary static/root E2E must not execute it.
  testIgnore: liveLessonSessionPhase ? [] : ["**/auth-lesson-session.spec.ts"],
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: `node ./node_modules/astro/bin/astro.mjs preview --host ${host} --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
