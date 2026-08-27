const CACHE_PREFIX = "potential-pwa-";
const CACHE = `${CACHE_PREFIX}v2`;
const SCOPE_URL = new URL("./", self.registration.scope);
const withBase = (path = "") => new URL(path.replace(/^\/+/, ""), SCOPE_URL).pathname;
const CORE = [
  withBase(),
  withBase("ru/"),
  withBase("uk/"),
  withBase("offline.html"),
  withBase("manifest.webmanifest"),
  withBase("icons/potential.svg"),
];
const CACHEABLE_DESTINATIONS = new Set([
  "font",
  "image",
  "manifest",
  "script",
  "style",
]);
const PRIVATE_PATH_PREFIXES = ["api", "auth", "checkout", "payments"].map(withBase);

function isPublicSameOriginRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return !PRIVATE_PATH_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

function isCacheableResponse(response) {
  if (!response.ok || response.status === 206 || response.type !== "basic") {
    return false;
  }
  if (response.headers.get("vary") === "*") return false;
  const directives = (response.headers.get("cache-control") ?? "")
    .toLowerCase()
    .split(",")
    .map((directive) => directive.trim());
  return !directives.some(
    (directive) => directive === "no-store" || directive.startsWith("private"),
  );
}

function navigationCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.href;
}

async function putIfPossible(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch {
    // A cache quota/write failure must not replace a successful network response.
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  const cacheKey = navigationCacheKey(request);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await putIfPossible(cache, cacheKey, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(cacheKey)) || cache.match(withBase("offline.html"));
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await putIfPossible(cache, request, response.clone());
  }
  return response;
}

async function migrateProjectCaches() {
  const currentCache = await caches.open(CACHE);
  const oldKeys = (await caches.keys()).filter(
    (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE,
  );

  for (const key of oldKeys) {
    const oldCache = await caches.open(key);
    for (const request of await oldCache.keys()) {
      if (!isPublicSameOriginRequest(request)) continue;
      const response = await oldCache.match(request);
      const target =
        request.mode === "navigate" ? navigationCacheKey(request) : request;
      if (
        response &&
        isCacheableResponse(response) &&
        !(await currentCache.match(target))
      ) {
        await putIfPossible(currentCache, target, response);
      }
    }
    await caches.delete(key);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    migrateProjectCaches()
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isPublicSameOriginRequest(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
