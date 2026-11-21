import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const directory = process.env.LAB_EVAL_OUTPUT;
if (!directory || !process.env.BUILD_OUTPUT_DIR) {
  throw new Error("Use pnpm eval:labs to build the education artifact and collect evidence.");
}

const origin = "http://127.0.0.1:4327";

export default defineConfig({
  testDir: "./tests/lab-eval",
  testMatch: "**/*.e2e.ts",
  outputDir: join(directory, "artifacts"),
  reporter: [["line"], ["json", { outputFile: join(directory, "playwright.json") }]],
  workers: 1,
  retries: 0,
  forbidOnly: true,
  globalTimeout: 120_000,
  use: {
    baseURL: origin,
    trace: "on",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop",
      timeout: 20_000,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      timeout: 30_000,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4327 --ignore-lock",
    url: origin + "/ru/interactive/transmission-line/",
    reuseExistingServer: false,
    timeout: 30_000,
    env: { ASTRO_PREVIEW_BACKGROUND: "0", PUBLIC_EDUCATION_MODE: "true", PUBLIC_MVP_MODE: "false" },
  },
});
