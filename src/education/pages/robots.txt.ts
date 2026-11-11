import type { APIRoute } from "astro";
import { withBasePath } from "../../site-path";

export const GET: APIRoute = ({ site }) => new Response(
  `User-agent: *\nAllow: /\nSitemap: ${new URL(withBasePath("/sitemap-index.xml"), site)}\n`,
  { headers: { "Content-Type": "text/plain; charset=utf-8" } },
);
