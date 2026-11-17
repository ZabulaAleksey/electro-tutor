import { expect, test } from "@playwright/test";

test("late MeshLab hydration cannot rewrite a destination route", async ({ page }) => {
  let releaseHydration!: () => void;
  const hydrationGate = new Promise<void>(resolve => { releaseHydration = resolve; });
  let hydrationRequestSeen = false;
  const saved = JSON.stringify({ version: 1, example: 4, draft: { R1: "2", R2: "4", E1: "12", J: "1" }, active: "R1", loop: 1 });

  await page.addInitScript(value => sessionStorage.setItem("potential-mesh-lab:mvp:v1", value), saved);
  await page.route("**/_astro/MeshLab.*.js", async route => {
    hydrationRequestSeen = true;
    const response = await route.fetch();
    const body = await response.body();
    await hydrationGate;
    await route.fulfill({ response, body });
  });

  try {
    await page.goto("/ru/topics/dc/mesh-current-method/lab/?example=4&reset=1", { waitUntil: "domcontentloaded" });
    await expect.poll(() => hydrationRequestSeen).toBe(true);
    await expect(page.locator(".mesh-lab")).toHaveAttribute("data-ready", "false");

    // Simulate Astro's history destination becoming current before the delayed
    // island effect is flushed. The old implementation appended example=1 and
    // overwrote the saved context from this now-inactive island.
    await page.evaluate(() => history.replaceState(history.state, "", "/ru/topics/"));
    releaseHydration();

    await expect(page.locator(".mesh-lab")).toHaveAttribute("data-ready", "true");
    await expect(page).toHaveURL("/ru/topics/");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("potential-mesh-lab:mvp:v1"))).toBe(saved);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
