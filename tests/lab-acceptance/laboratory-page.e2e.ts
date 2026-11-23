import { expect, test } from "@playwright/test";

const prefix = (process.env.E2E_BASE_PATH ?? "/").replace(/\/$/, "");

for (const language of ["ru", "uk"] as const) {
  test(`shared header and fixed simulation controls · ${language}`, async ({ page }) => {
    const directory = `${prefix}/${language}/interactive/`;
    await page.setViewportSize({ width: language === "ru" ? 1280 : 390, height: 680 });
    await page.goto(directory + "transmission-line/experiment/");
    const intro = page.locator(".laboratory-intro");
    await expect(intro.getByRole("link")).toHaveAttribute("href", directory);
    await expect(intro.locator("p")).not.toBeEmpty();

    const controls = page.locator(".line-a-playback");
    const start = controls.getByRole("button", { name: "Старт" });
    const pause = controls.getByRole("button", { name: "Пауза" });
    const stop = controls.getByRole("button", { name: "Стоп" });
    const simulation = page.locator("[data-line-a-results]");
    const time = async () => Number(await simulation.getAttribute("data-time-s"));
    await expect(start).toBeInViewport();
    await start.click();
    await expect.poll(time).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await expect(pause).toBeInViewport();
    await pause.click();
    const paused = await time();
    await expect(start).toBeEnabled();
    await expect.poll(time).toBe(paused);
    await page.locator('[data-line-section="TL1"]').click();
    await expect(simulation).toHaveAttribute("data-calculation-ready", "true");
    await expect(simulation).toHaveAttribute("data-time-s", String(paused));
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await expect(stop).toBeInViewport();
    await stop.click();
    await expect.poll(time).toBe(0);
    await expect(page.locator("[data-line-a-clock]")).toContainText("0");

    await page.goto(directory + "circular-diagram/");
    const title = await page.locator("h1").innerText();
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
    await page.locator(".laboratory-intro a").click();
    await expect(page).toHaveURL(url => url.pathname === directory);
  });
}
