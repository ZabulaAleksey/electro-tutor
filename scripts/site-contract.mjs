export function normalizeBasePath(value = "/") {
  const input = String(value || "/").trim().replaceAll("\\", "/");
  const path = input.startsWith("/") ? input : `/${input}`;
  if (path.includes("?") || path.includes("#") || path.includes(":") || path.includes("//")) {
    throw new Error(`BASE_PATH must be a URL path without origin, query or fragment: ${value}`);
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`BASE_PATH must not contain dot segments: ${value}`);
  }
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

export function normalizeSiteOrigin(value) {
  const site = new URL(value);
  if (!new Set(["https:", "http:"]).has(site.protocol)) {
    throw new Error(`SITE_URL must use http or https: ${value}`);
  }
  if (site.username || site.password || site.search || site.hash || !["", "/"].includes(site.pathname)) {
    throw new Error(`SITE_URL must contain only an origin; use BASE_PATH for deployment paths: ${value}`);
  }
  return site.origin;
}
