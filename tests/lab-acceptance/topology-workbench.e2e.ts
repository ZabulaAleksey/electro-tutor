import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");
const playground = (locale: "ru" | "uk") => `${prefix}/${locale}/interactive/circuit-editor/`;
const topologyRoute = (locale: "ru" | "uk") => playground(locale) + "topology/";
const components = "[data-topology-component]";
const viewSelector = "[data-topology-viewport]";
const graphSelector = "[data-topology-svg]";

async function snapshotDocument(page: Page, testInfo: TestInfo, label: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-topology-export]").click(),
  ]);
  const path = testInfo.outputPath(label + ".json");
  await download.saveAs(path);
  return readFile(path, "utf8");
}

async function currentZoom(page: Page) {
  return Number(await page.locator("[data-topology-zoom]").getAttribute("data-topology-zoom"));
}

async function verifySpacing(page: Page) {
  const issue = await page.locator("[data-topology-workbench]").evaluate((workbench) => {
    type Box = { name: string; left: number; top: number; right: number; bottom: number };
    function boxes(query: string): Box[] {
      return [...workbench.querySelectorAll(query)].flatMap((element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return width && height ? [{
          name: element.getAttribute("data-topology-component") ??
            element.getAttribute("data-topology-junction") ?? element.tagName,
          left, top, right, bottom,
        }] : [];
      });
    }
    function intersect(items: Box[]) {
      for (const [i, a] of items.entries()) {
        for (const b of items.slice(i + 1)) {
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
            && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
            return [a.name, b.name].join(":");
          }
        }
      }
      return null;
    }
    const controls = boxes("[data-topology-hit]:not([data-topology-slot-insert])");
    const tiny = controls.find(({ left, right, top, bottom }) => right - left < 44 || bottom - top < 44);
    if (tiny) return "too-small:" + tiny.name;
    const drawing = boxes("[data-topology-component], [data-topology-junction]");
    const active = boxes("[data-topology-slot-insert]");
    if (active.some(({ left, right, top, bottom }) => right - left < 44 || bottom - top < 44)) {
      return "too-small:canvas-slot";
    }
    return intersect(controls) ?? intersect([...drawing, ...active]);
  });
  expect(issue).toBeNull();
}

for (const width of [1440, 768, 390, 360]) {
  test.describe(`layout at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 500 ? 844 : 960 }, isMobile: width < 500, hasTouch: width < 500 });
    test(`SVG layouts 1/10/50/200 stay legible and scrollable at ${width}px`, async ({ page }, testInfo) => {
      const locale = width < 500 ? "uk" : "ru";
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(topologyRoute(locale));
      await expect(page.locator("[data-topology-workbench]")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const sizes: number[] = [];
      for (const count of [1, 10, 50, 200]) {
        await page.locator("[data-topology-preset]").selectOption(String(count));
        await expect(page.locator(components)).toHaveCount(count);
        await verifySpacing(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const layout = await page.locator(graphSelector).evaluate(node => {
          const svg = node as SVGSVGElement;
          return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
        });
        sizes.push(layout.width * layout.height);
        if (count === 10) {
          for (const kind of ["r", "l", "c", "voltage", "current", "switch-open", "switch-closed", "line"]) {
            await expect(page.locator(`[data-topology-kind="${kind}"]`).first()).toHaveCount(1);
          }
        }
        if (count === 200) {
          const labels = await page.locator("[data-topology-target] option").allTextContents();
          expect(labels.length).toBeGreaterThan(10);
          expect(new Set(labels).size).toBe(labels.length);
        }
        if (width === 1440 || width === 390) {
          const path = testInfo.outputPath(`topology-${count}-${width}.png`);
          await page.locator("[data-topology-workbench]").evaluate(node => node.scrollIntoView({ block: "start" }));
          await page.screenshot({ path, animations: "disabled" });
          await testInfo.attach(`topology-${count}-${width}`, { path, contentType: "image/png" });
        }
      }
      expect(sizes[3]).toBeGreaterThan(sizes[2]);
      expect(sizes[2]).toBeGreaterThan(sizes[1]);
      expect(sizes[1]).toBeGreaterThan(sizes[0]);
      expect(errors).toEqual([]);
    });
  });
}

test("E3 from the free editor supports keyboard insertion, geometric side and JSON undo", async ({ page }, testInfo) => {
  await page.goto(playground("ru"));
  await page.locator("[data-topology-mode-link]").click();
  await expect(page).toHaveURL(new RegExp(topologyRoute("ru") + "$"));
  await expect(page.locator("[data-topology-preset]")).toHaveValue("e3");
  const count = await page.locator(components).count();
  const before = await snapshotDocument(page, testInfo, "e3-before");

  await page.locator("[data-topology-context]").selectOption("R1");
  const side = page.locator("[data-topology-side]");
  const marker = page.locator("[data-topology-slot-marker]");
  await side.selectOption("left");
  await expect(marker).toHaveAttribute("data-topology-slot-marker", "left");
  const first = await marker.getAttribute("transform");
  await side.focus();
  await side.press("End");
  await expect(side).toHaveValue("right");
  await expect(marker).toHaveAttribute("data-topology-slot-marker", "right");
  expect(await marker.getAttribute("transform")).not.toBe(first);

  await page.locator("[data-topology-target]").selectOption('parallel:["L1","R1"]:right');
  await page.locator("[data-topology-insert]").press("Enter");
  await expect(page.locator(components)).toHaveCount(count + 1);
  const inserted = await snapshotDocument(page, testInfo, "e3-inserted");
  const original = JSON.parse(before);
  const after = JSON.parse(inserted);
  expect(after.topology.components).toHaveLength(original.topology.components.length + 1);
  expect(after.topology.wires).toEqual(expect.arrayContaining(original.topology.wires));
  expect(after.attachmentSides).toEqual([expect.objectContaining({ side: "right" })]);

  await page.locator("[data-topology-undo]").press("Enter");
  await expect(page.locator(components)).toHaveCount(count);
  expect(await snapshotDocument(page, testInfo, "e3-undo")).toBe(before);
  await page.locator("[data-topology-redo]").press("Enter");
  expect(await snapshotDocument(page, testInfo, "e3-redo")).toBe(inserted);
});

test("explicit cross insertion survives preset switching and preserves prior wires", async ({ page }, testInfo) => {
  await page.goto(topologyRoute("ru"));
  const before = JSON.parse(await snapshotDocument(page, testInfo, "cross-before"));
  await page.locator("[data-topology-mode]").selectOption("cross");
  await page.locator("[data-topology-from]").selectOption("J1:b");
  await page.locator("[data-topology-to]").selectOption("TL2:b");
  await page.locator("[data-topology-part]").selectOption("c");
  await page.locator("[data-topology-insert]").click();
  await expect(page.locator(components)).toHaveCount(before.topology.components.length + 1);
  const after = await snapshotDocument(page, testInfo, "cross-after");
  expect(JSON.parse(after).topology.wires).toEqual(expect.arrayContaining(before.topology.wires));
  await page.locator("[data-topology-preset]").selectOption("1");
  await expect(page.locator(components)).toHaveCount(1);
  await page.locator("[data-topology-preset]").selectOption("e3");
  expect(await snapshotDocument(page, testInfo, "cross-restored")).toBe(after);
});

test("buttons, Ctrl+wheel, arrows and mouse drag change only the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1010, height: 900 });
  await page.goto(topologyRoute("ru"));
  await page.locator("[data-topology-preset]").selectOption("50");
  await expect(page.locator(components)).toHaveCount(50);
  const before = await snapshotDocument(page, testInfo, "desktop-before-zoom");
  const viewport = page.locator(viewSelector);
  await page.locator("[data-topology-zoom-in]").click();
  await expect.poll(() => currentZoom(page)).toBeGreaterThan(1);
  await page.locator("[data-topology-zoom-out]").click();
  await expect.poll(() => currentZoom(page)).toBeCloseTo(1);
  await viewport.scrollIntoViewIfNeeded();
  const rect = (await viewport.boundingBox())!;
  const x = rect.x + rect.width * .6;
  const y = rect.y + rect.height * .5;
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  try { await page.mouse.wheel(0, -160); }
  finally { await page.keyboard.up("Control"); }
  await expect.poll(() => currentZoom(page)).toBeGreaterThan(1);
  const scroll = () => viewport.evaluate(element => element.scrollLeft);
  const start = await scroll();
  await viewport.press("ArrowRight");
  await expect.poll(scroll).toBeGreaterThan(start);
  const prior = await scroll();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 90, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(scroll).toBeGreaterThan(prior);
  expect(await snapshotDocument(page, testInfo, "desktop-after-zoom")).toBe(before);
});

test.describe("touch viewport", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("pinch and one-finger pan preserve JSON while touch inserts a real element", async ({ page }, testInfo) => {
    await page.goto(topologyRoute("uk"));
    await page.locator("[data-topology-preset]").selectOption("50");
    await expect(page.locator(components)).toHaveCount(50);
    const before = await snapshotDocument(page, testInfo, "mobile-before-zoom");
    const viewport = page.locator(viewSelector);
    await viewport.scrollIntoViewIfNeeded();
    const { x: left, width, y: top, height } = (await viewport.boundingBox())!;
    const x = Math.round(left + width / 2), y = Math.round(top + height / 2);
    const gesture = await page.context().newCDPSession(page);
    try {
      const spread = (d: number) => [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }];
      await gesture.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: spread(27) });
      await gesture.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: spread(51) });
      await gesture.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => currentZoom(page)).toBeGreaterThan(1.25);
      expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
      const scroll = () => viewport.evaluate(element => element.scrollLeft);
      const start = await scroll();
      await gesture.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 3 }] });
      await gesture.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60, y, id: 3 }] });
      await gesture.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(scroll).toBeGreaterThan(start);
    } finally {
      await gesture.detach();
    }
    expect(await snapshotDocument(page, testInfo, "mobile-after-zoom")).toBe(before);
    await page.locator("[data-topology-mode]").selectOption("series");
    await page.locator("[data-topology-slot-insert]").tap();
    await expect(page.locator(components)).toHaveCount(51);
    expect(await snapshotDocument(page, testInfo, "mobile-after-insert")).not.toBe(before);
  });
});
