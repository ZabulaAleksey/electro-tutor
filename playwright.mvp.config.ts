import {defineConfig} from "@playwright/test";
import base from "./playwright.config";
export default defineConfig(base,{use:{...base.use,baseURL:process.env.MVP_E2E_ORIGIN||base.use?.baseURL},testMatch:"**/mvp-*.spec.ts",testIgnore:[],outputDir:process.env.MVP_TEST_OUTPUT || "./test-results/mvp"});
