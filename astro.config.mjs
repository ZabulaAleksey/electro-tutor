import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL || "https://electrotutor.example";

export default defineConfig({
  site,
  output: "static",
  integrations: [react(), mdx(), sitemap()],
  build: {
    format: "directory",
  },
});
