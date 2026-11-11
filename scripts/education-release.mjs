import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { edgeWorkerSource } from "./mvp-edge-404.mjs";
import { educationEdgeRoutes, restrictedEducationPaths } from "./education-routes.mjs";
import { assertPublicText, filesUnder, securityHeaders } from "./release-policy.mjs";
import { normalizeBasePath } from "./site-contract.mjs";

const marker = "education-build.json";
const matchRestrictedFile = file => restrictedEducationPaths.some(route => {
  const path = route.slice(1);
  return file === path || file === `${path}.html` || file.startsWith(`${path}/`);
});

function publicationHeaders(html, base) {
  return securityHeaders(html, base, { education: true });
}

export function educationReleaseIntegration(base) {
  return {
    name: "electrotutor-education-release",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const files = await filesUnder(root);
        const html = await Promise.all(files.filter(file => file.endsWith(".html")).map(file => readFile(join(root, file), "utf8")));
        const headers = publicationHeaders(html, base);
        const notFound = await readFile(join(root, "404.html"), "utf8");
        const workerPath = join(root, "sw.js");
        const worker = await readFile(workerPath, "utf8");
        const restricted = restrictedEducationPaths.map(route => `withBase(${JSON.stringify(route)})`).join(", ");
        const restrictedDeclaration = '["api", "auth", "checkout", "payments"].map(withBase)';
        assert.ok(worker.includes(restrictedDeclaration), "Service worker route guard missing");
        assert.ok(worker.includes('v2`'), "Service worker release version marker missing");
        await Promise.all([
          writeFile(join(root, "_headers"), headers),
          writeFile(join(root, "_worker.js"), edgeWorkerSource({ html: notFound, headers })),
          writeFile(join(root, "_routes.json"), JSON.stringify(educationEdgeRoutes(base), null, 2) + "\n"),
          writeFile(workerPath, worker.replace('v2`', 'education-v1`').replace(restrictedDeclaration, `[${restricted}]`)),
          writeFile(join(root, marker), JSON.stringify({ profile: "education" }) + "\n"),
        ]);
      },
    },
  };
}

export async function auditEducationRelease(root, base = "/") {
  const files = await filesUnder(root);
  const html = [];
  for (const file of files) {
    assert.ok(!matchRestrictedFile(file), `Restricted route emitted: ${file}`);
    if (file.endsWith(".map")) assert.fail(`Source map emitted: ${file}`);
    if (!/\.(?:html|js|mjs|json|css|webmanifest|svg|txt|xml)$/.test(file)) continue;
    const source = await readFile(join(root, file), "utf8");
    assertPublicText(source, file);
    if (file.endsWith(".html")) html.push(source);
  }
  for (const locale of ["ru", "uk"]) {
    for (const page of ["", "topics/", "solutions/", "interactive/", "help/", "contacts/", "privacy/"]) {
      assert.ok(files.includes(`${locale}/${page}index.html`), `Missing public page ${locale}/${page}`);
    }
  }
  const read = name => readFile(join(root, name), "utf8");
  const [headers, notFound, worker, routes, serviceWorker] = await Promise.all(
    ["_headers", "404.html", "_worker.js", "_routes.json", "sw.js"].map(read),
  );
  assert.equal(headers, publicationHeaders(html, base));
  assert.match(notFound, /name="robots" content="noindex"/);
  assert.equal(worker, edgeWorkerSource({ html: notFound, headers }));
  assert.deepEqual(JSON.parse(routes), educationEdgeRoutes(base));
  assert.match(serviceWorker, /education-v1/);
  for (const route of restrictedEducationPaths) assert.ok(serviceWorker.includes(`withBase("${route}")`), `Service worker missing guard: ${route}`);
  console.log(`Education release audit passed: ${html.length} HTML, ${restrictedEducationPaths.length} restricted paths, CSP and offline guards.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await auditEducationRelease(resolve(process.env.BUILD_OUTPUT_DIR || "dist"), normalizeBasePath(process.env.BASE_PATH));
}
