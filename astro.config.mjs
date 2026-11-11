import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";
import { themeConfiguration } from "./src/theme-configuration.mjs";
import { normalizeBasePath, normalizeSiteOrigin } from "./scripts/site-contract.mjs";

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
import { isPublicPage, mvpMode } from "./scripts/public-mvp-contract.mjs";
import { mvpWorkerIntegration } from "./scripts/mvp-worker.mjs";
import { releaseHeadersIntegration } from "./scripts/release-policy.mjs";
import { educationRoutesIntegration } from "./scripts/education-routes.mjs";
import { educationReleaseIntegration } from "./scripts/education-release.mjs";
const education = env.PUBLIC_EDUCATION_MODE === "true";
const mvp = !education && mvpMode(env.PUBLIC_MVP_MODE);
const site = normalizeSiteOrigin(env.SITE_URL || "https://electrotutor.example");
const base = normalizeBasePath(env.BASE_PATH);

const lightThemeStyles = {
  postcssPlugin: "electrotutor-light-theme",
  Once(root) {
    root.walkAtRules("media", rule => {
      if (/prefers-color-scheme\s*:\s*dark/.test(rule.params)) rule.remove();
    });
    root.walkRules(rule => {
      const selectors = rule.selectors;
      const lightSelectors = selectors.filter(selector => !/\[data-theme\s*=\s*["']?dark["']?\s*\]/.test(selector));
      if (lightSelectors.length === 0) rule.remove();
      else if (lightSelectors.length !== selectors.length) rule.selectors = lightSelectors;
    });
  },
};

export default defineConfig({
  site,
  ...(mvp ? {srcDir:"./src/mvp",publicDir:"./src/mvp/static"} : {}),
  ...(education ? { srcDir: "./src/education" } : {}),
  vite: {
    define: {
      "import.meta.env.PUBLIC_MVP_MODE": JSON.stringify(String(mvp)),
      "import.meta.env.PUBLIC_EDUCATION_MODE": JSON.stringify(String(education)),
      ...(mvp || education ? {"import.meta.env.PUBLIC_API_ORIGIN":JSON.stringify("")} : {}),
    },
    ...(themeConfiguration.allowDark ? {} : { css: { postcss: { plugins: [lightThemeStyles] } } }),
  },
  base,
  trailingSlash: "always",
  outDir: env.BUILD_OUTPUT_DIR || "./dist",
  output: "static",
  integrations: [react(), mdx(), sitemap({filter: page => !mvp || (new URL(page).pathname !== base && isPublicPage(new URL(page).pathname,base))}), ...(mvp ? [releaseHeadersIntegration(base),mvpWorkerIntegration(base)] : []), ...(education ? [educationRoutesIntegration, educationReleaseIntegration(base)] : [])],
  build: {
    format: "directory",
  },
});
