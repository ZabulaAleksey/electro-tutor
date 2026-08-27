import type { Language } from "./types";

export const SITE_BASE_PATH = import.meta.env.BASE_URL;

export function withBasePath(path: string, basePath = SITE_BASE_PATH): string {
  const base = basePath === "/" ? "/" : `/${basePath.split("/").filter(Boolean).join("/")}/`;
  const relative = path.replace(/^\/+/, "");
  return relative ? `${base}${relative}` : base;
}

export function localePath(
  language: Language,
  semanticPath = "/",
  basePath = SITE_BASE_PATH,
): string {
  return withBasePath(`${language}/${semanticPath.replace(/^\/+/, "")}`, basePath);
}

export function stripBasePath(path: string, basePath = SITE_BASE_PATH): string {
  const base = withBasePath("", basePath);
  if (base === "/") return path;
  const withoutTrailingSlash = base.slice(0, -1);
  if (path === withoutTrailingSlash) return "/";
  return path.startsWith(base) ? `/${path.slice(base.length)}` : path;
}
