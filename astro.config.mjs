import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";
import { normalizeBasePath, normalizeSiteOrigin } from "./scripts/site-contract.mjs";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
import { isPublicPage, mvpMode } from "./scripts/public-mvp-contract.mjs";
import { mvpWorkerIntegration } from "./scripts/mvp-worker.mjs";
const mvp = mvpMode(env.PUBLIC_MVP_MODE);
const site = normalizeSiteOrigin(env.SITE_URL || "https://electrotutor.example");
const base = normalizeBasePath(env.BASE_PATH);

export default defineConfig({
  site,
  ...(mvp ? {srcDir:"./src/mvp",publicDir:"./src/mvp/static"} : {}),
  vite: { define: { "import.meta.env.PUBLIC_MVP_MODE": JSON.stringify(String(mvp)), ...(mvp ? {"import.meta.env.PUBLIC_API_ORIGIN":JSON.stringify("")} : {}) } },
  base,
  trailingSlash: "always",
  outDir: env.BUILD_OUTPUT_DIR || "./dist",
  output: "static",
  integrations: [react(), mdx(), sitemap({filter: page => !mvp || (new URL(page).pathname !== base && isPublicPage(new URL(page).pathname,base))}), ...(mvp ? [mvpWorkerIntegration(base)] : [])],
  build: {
    format: "directory",
  },
});
