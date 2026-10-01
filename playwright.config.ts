import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = 4322;
const baseURL = `http://${host}:${port}`;
const liveLessonSessionPhase =
  process.env.E2E_AUTH_PHASE === "lesson-session" &&
  process.env.E2E_SPEC === "tests/e2e/auth-lesson-session.spec.ts";
const liveNotificationPhase =
  process.env.E2E_AUTH_PHASE === "notification" &&
  process.env.E2E_SPEC === "tests/e2e/auth-notifications.spec.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  // Secret-bearing Session and notification scenarios require explicit live phases.
  // Ordinary static/root E2E excludes both.
  testIgnore: liveLessonSessionPhase || liveNotificationPhase
    ? [] : ["**/auth-lesson-session.spec.ts", "**/auth-notifications.spec.ts"],
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
