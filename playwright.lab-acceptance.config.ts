import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./tests/lab-acceptance",
  testMatch: "**/*.e2e.ts",
});
