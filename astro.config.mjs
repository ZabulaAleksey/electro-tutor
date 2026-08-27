import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";
import { normalizeBasePath, normalizeSiteOrigin } from "./scripts/site-contract.mjs";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
const site = normalizeSiteOrigin(env.SITE_URL || "https://electrotutor.example");
const base = normalizeBasePath(env.BASE_PATH);

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  outDir: env.BUILD_OUTPUT_DIR || "./dist",
  output: "static",
  integrations: [react(), mdx(), sitemap()],
  build: {
    format: "directory",
  },
});
