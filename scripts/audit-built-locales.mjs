import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { normalizeBasePath } from "./site-contract.mjs";

const root = resolve(process.env.BUILD_OUTPUT_DIR || "dist");
const basePath = normalizeBasePath(process.env.BASE_PATH);
const publicPath = (route) => basePath === "/" ? route : `${basePath.slice(0, -1)}${route}`;
const htmlFiles = [];
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else if (name === "index.html") htmlFiles.push(path);
  }
}
await walk(root);

const routes = new Set(htmlFiles.map((file) => `/${relative(root, file).split(sep).slice(0, -1).join("/")}/`.replace("//", "/")));
const localizedRoutes = [...routes].filter((route) => /^\/(ru|uk)\//.test(route));
const errors = [];
for (const route of routes) {
  if (route !== "/" && !/^\/(ru|uk)\//.test(route)) errors.push(`unexpected locale route in artifact: ${route}`);
}

for (const route of localizedRoutes) {
  const language = route.split("/")[1];
  const semanticPath = route.replace(/^\/(ru|uk)/, "");
  const htmlPath = join(root, ...route.split("/").filter(Boolean), "index.html");
  const html = await readFile(htmlPath, "utf8");
  if (!new RegExp(`<html[^>]+lang=["']${language}["']`).test(html)) errors.push(`${route}: incorrect html lang`);
  for (const targetLanguage of ["ru", "uk"]) {
    const target = `/${targetLanguage}${semanticPath}`;
    const publicTarget = publicPath(target);
    if (!routes.has(target)) errors.push(`${route}: alternate target is absent: ${target}`);
    if (!new RegExp(`<link[^>]+rel=["']alternate["'][^>]+hreflang=["']${targetLanguage}["'][^>]+href=["'][^"']*${publicTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(html)) {
      errors.push(`${route}: missing hreflang ${targetLanguage}`);
    }
  }
  const canonicalMatches = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/g)];
  if (canonicalMatches.length !== 1) errors.push(`${route}: expected one canonical, found ${canonicalMatches.length}`);
  else if (new URL(canonicalMatches[0][1]).pathname !== publicPath(route)) errors.push(`${route}: canonical points to ${canonicalMatches[0][1]}`);
  const xDefault = html.match(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']x-default["'][^>]+href=["']([^"']+)["']/);
  const expectedDefault = publicPath(`/ru${semanticPath}`);
  if (!xDefault) errors.push(`${route}: missing x-default`);
  else if (new URL(xDefault[1]).pathname !== expectedDefault) errors.push(`${route}: x-default points to ${xDefault[1]}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Locale artifact audit passed: ${localizedRoutes.length} localized routes.`);
}
