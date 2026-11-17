import { expect, test } from "@playwright/test";

test("late font loading preserves the beam zoom anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let release!: () => void;
  const fontGate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://fonts.gstatic.com/**", async route => {
    await fontGate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/ru/interactive/beam/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-ready", "true");
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loading");
    const svg = page.locator("[data-beam-scheme]");
    await svg.evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
    const screen = () => svg.evaluate(node => {
      const point = new DOMPoint(510, 175).matrixTransform((node as SVGSVGElement).getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
    const before = await screen();
    await page.mouse.move(before.x, before.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -90);
    await page.keyboard.up("Control");
    await expect(page.locator("[data-beam-zoom]")).not.toHaveText("100%");
    release();
    await page.evaluate(() => document.fonts.ready);
    const after = await screen();
    expect(Math.abs(after.x - before.x)).toBeLessThan(3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  } finally {
    release();
  }
});
