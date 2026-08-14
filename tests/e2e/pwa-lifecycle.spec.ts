import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const notFoundPath = "/ru/not-cached-offline/";

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const expectedNotFound =
      location.length > 0 &&
      new URL(location).pathname === notFoundPath &&
      message.text().includes("404");
    if (!expectedNotFound) errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(
      `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    );
  });
  return errors;
}

function instrumentWorker(source: string, version: string) {
  return `const E2E_WORKER_VERSION = ${JSON.stringify(version)};\n${source}\n` +
    `self.addEventListener("message", (event) => {\n` +
    `  if (event.data?.type === "e2e-worker-version") {\n` +
    `    event.ports[0]?.postMessage(E2E_WORKER_VERSION);\n` +
    `  }\n` +
    `});\n`;
}

async function startVersionedPreview(
  workerSource: string,
  getWorkerVersion: () => string,
) {
  const upstreamOrigin = "http://127.0.0.1:4322";
  let workerRequests = 0;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", upstreamOrigin);
      if (url.pathname === "/sw.js") {
        workerRequests += 1;
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/javascript; charset=utf-8",
        });
        response.end(instrumentWorker(workerSource, getWorkerVersion()));
        return;
      }
      if (url.pathname === "/ru/no-store-e2e/") {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        });
        response.end("<!doctype html><html><body><h1>No-store page</h1></body></html>");
        return;
      }
      if (url.pathname === "/api/e2e-private") {
        response.writeHead(200, {
          "Cache-Control": "public, max-age=300",
          "Content-Type": "application/json; charset=utf-8",
        });
        response.end('{"ok":true}');
        return;
      }

      const upstream = await fetch(url, { redirect: "manual" });
      const headers: Record<string, string> = {};
      for (const name of ["cache-control", "content-type", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      const location = upstream.headers.get("location");
      if (location) {
        const target = new URL(location, upstreamOrigin);
        headers.location = `${target.pathname}${target.search}${target.hash}`;
      }
      response.writeHead(upstream.status, headers);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Proxy error");
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    workerRequests: () => workerRequests,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

async function waitForController(page: Page) {
  return page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) {
      return navigator.serviceWorker.controller.scriptURL;
    }

    return new Promise<string>((resolveController, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Service worker did not take control.")),
        10_000,
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          const controller = navigator.serviceWorker.controller;
          if (controller) resolveController(controller.scriptURL);
          else reject(new Error("Controller change did not provide a controller."));
        },
        { once: true },
      );
    });
  });
}

async function readControllerVersion(page: Page) {
  return page.evaluate(() =>
    new Promise<string>((resolveVersion, reject) => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        reject(new Error("The page has no service worker controller."));
        return;
      }

      const channel = new MessageChannel();
      const timeout = window.setTimeout(
        () => reject(new Error("Service worker version probe timed out.")),
        5_000,
      );
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolveVersion(String(event.data));
      };
      controller.postMessage({ type: "e2e-worker-version" }, [channel.port2]);
    }),
  );
}

async function activateUpdatedWorker(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const controllerChanged = new Promise<void>((resolveChange, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Updated service worker did not take control.")),
        10_000,
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          resolveChange();
        },
        { once: true },
      );
    });

    await registration.update();
    await controllerChanged;
  });
}

test("FR-008 updates the controlled client and preserves safe offline navigation", async ({
  context,
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const workerSource = await readFile(resolve(process.cwd(), "dist", "sw.js"), "utf8");
  let workerVersion = "1";
  const preview = await startVersionedPreview(workerSource, () => workerVersion);
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/css; charset=utf-8",
      body: "/* deterministic test response */",
    }),
  );

  try {
    await page.goto(`${preview.origin}/ru/`, { waitUntil: "load" });
    const initialScriptURL = await waitForController(page);
    expect(new URL(initialScriptURL).pathname).toBe("/sw.js");
    expect(new URL(initialScriptURL).search).toBe("");
    expect(await readControllerVersion(page)).toBe("1");

    await page.goto(`${preview.origin}/ru/topics/`, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Карта электротехники" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => Boolean(await caches.match(location.href))))
      .toBe(true);

    await page.evaluate(async () => {
      await caches.open("unrelated-e2e-sentinel");
      await caches.open("potential-pwa-e2e-old");
    });
    workerVersion = "2";
    await activateUpdatedWorker(page);
    expect(preview.workerRequests()).toBeGreaterThanOrEqual(2);
    expect(await readControllerVersion(page)).toBe("2");

    await expect.poll(() => page.evaluate(() => caches.keys())).toContain(
      "unrelated-e2e-sentinel",
    );
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(
      "potential-pwa-e2e-old",
    );

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Карта электротехники" }),
    ).toBeVisible();
    expect(await readControllerVersion(page)).toBe("2");
    await context.setOffline(false);

    const classroomWithRoom = `${preview.origin}/ru/classroom/?room=e2e-room-code`;
    await page.goto(classroomWithRoom, { waitUntil: "load" });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open("potential-pwa-v2");
          return Boolean(await cache.match("/ru/classroom/"));
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(async (url) => {
        const cache = await caches.open("potential-pwa-v2");
        return Boolean(await cache.match(url));
      }, classroomWithRoom),
    ).toBe(false);

    const noStoreResponse = await page.goto(`${preview.origin}/ru/no-store-e2e/`, {
      waitUntil: "domcontentloaded",
    });
    expect(noStoreResponse?.ok()).toBe(true);
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(async () => Boolean(await caches.match(location.href))),
    ).toBe(false);

    const privateRequestURL = `${preview.origin}/api/e2e-private`;
    expect(
      await page.evaluate(async (url) => (await fetch(url)).ok, privateRequestURL),
    ).toBe(true);
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(
        async (url) => Boolean(await caches.match(url)),
        privateRequestURL,
      ),
    ).toBe(false);

    const notFoundResponse = await page.goto(`${preview.origin}${notFoundPath}`, {
      waitUntil: "domcontentloaded",
    });
    expect(notFoundResponse?.status()).toBe(404);
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(async () => Boolean(await caches.match(location.href))),
    ).toBe(false);

    await context.setOffline(true);
    await page.goto(`${preview.origin}${notFoundPath}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Нет подключения / Немає з’єднання",
      }),
    ).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await preview.close();
  }
});
