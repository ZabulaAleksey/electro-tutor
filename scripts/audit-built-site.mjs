import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { normalizeBasePath, normalizeSiteOrigin } from "./site-contract.mjs";

const root = resolve(process.env.BUILD_OUTPUT_DIR || "dist");
const basePath = normalizeBasePath(process.env.BASE_PATH);
const siteOrigin = normalizeSiteOrigin(process.env.SITE_URL || "https://electrotutor.example");
const files = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);

const relativeFiles = new Set(files.map((file) => relative(root, file).split(sep).join("/")));
const errors = [];
const publicPath = (semanticPath) => basePath === "/"
  ? semanticPath
  : `${basePath.slice(0, -1)}${semanticPath}`;

function artifactTarget(pathname) {
  const basePrefix = basePath === "/" ? "/" : basePath;
  if (basePath !== "/" && pathname !== basePath.slice(0, -1) && !pathname.startsWith(basePrefix)) {
    return { error: `path escapes base ${basePath}: ${pathname}` };
  }
  const unprefixed = basePath === "/" ? pathname.slice(1) : pathname.slice(basePrefix.length);
  const decoded = decodeURIComponent(unprefixed);
  return { file: decoded === "" ? "index.html" : decoded.endsWith("/") ? `${decoded}index.html` : decoded };
}

function checkInternalUrl(raw, documentUrl, owner) {
  if (!raw || raw.startsWith("#") || /^(?:mailto|tel|data|javascript):/i.test(raw)) return;
  const url = new URL(raw, documentUrl);
  if (url.origin !== siteOrigin) return;
  const target = artifactTarget(url.pathname);
  if (target.error) errors.push(`${owner}: ${target.error}`);
  else if (!relativeFiles.has(target.file)) errors.push(`${owner}: missing target ${raw} -> ${target.file}`);
}

for (const file of files) {
  const relativeFile = relative(root, file).split(sep).join("/");
  if (!/\.(?:html|css|js|json|xml|webmanifest)$/.test(relativeFile)) continue;
  const source = await readFile(file, "utf8");
  if (/(?:localhost|127\.0\.0\.1|[A-Za-z]:[\\/]Users[\\/]|\/(?:Users|home)\/[^/]+\/)/i.test(source)) {
    errors.push(`${relativeFile}: machine-local URL/path leaked into artifact`);
  }
  if (relativeFile.endsWith(".html")) {
    const semanticRoute = relativeFile === "index.html"
      ? "/"
      : `/${relativeFile.replace(/index\.html$/, "")}`;
    const documentUrl = `${siteOrigin}${publicPath(semanticRoute)}`;
    for (const match of source.matchAll(/\b(?:href|src|action)=["']([^"']+)["']/g)) {
      checkInternalUrl(match[1], documentUrl, relativeFile);
    }
    for (const match of source.matchAll(/\bcontent=["'][^"']*\burl\s*=\s*([^"' ;>]+)/gi)) {
      checkInternalUrl(match[1], documentUrl, relativeFile);
    }
  }
  if (relativeFile.endsWith(".css")) {
    const documentUrl = `${siteOrigin}${publicPath(`/${relativeFile}`)}`;
    for (const match of source.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      checkInternalUrl(match[1], documentUrl, relativeFile);
    }
  }
}

const manifestPath = "manifest.webmanifest";
const manifest = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
const manifestUrl = `${siteOrigin}${publicPath("/manifest.webmanifest")}`;
for (const value of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src), ...manifest.shortcuts.map((shortcut) => shortcut.url)]) {
  checkInternalUrl(value, manifestUrl, manifestPath);
}

const worker = await readFile(join(root, "sw.js"), "utf8");
if (!worker.includes('self.registration.scope') || /cache\.match\(["']\/offline\.html/.test(worker)) {
  errors.push("sw.js: service worker paths are not derived from registration scope");
}

for (const required of ["index.html", "ru/index.html", "uk/index.html", "offline.html", "sw.js", "manifest.webmanifest", "icons/potential.svg"]) {
  if (!relativeFiles.has(required)) errors.push(`artifact is missing ${required}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Site artifact audit passed: ${relativeFiles.size} files, base ${basePath}.`);
}
