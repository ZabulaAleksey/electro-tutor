import { expect, test } from "@playwright/test";

test("keeps transient playback in document flow and fits the starter schematic", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const toolbar = lab.getByRole("group", { name: "Управление симуляцией" });
  const board = lab.locator(".circuit-viewport");
  await expect(lab.locator("[data-circuit-editor]")).toHaveAttribute("data-positions-locked", "true");
  const starterLine = board.locator('[data-line-section="TL1"] .network-transmission-stroke');
  await expect(starterLine).toBeVisible();
  await expect(board.locator('[data-line-section="TL1"]')).toHaveAttribute("transform", "translate(395 100)");
  expect(Number(await starterLine.getAttribute("width"))).toBeGreaterThanOrEqual(140);

  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await board.evaluate((element) => {
      const dock = document.querySelector(".network-dock")!;
      const plot = document.querySelector("svg[aria-label='I(x)']")!;
      return {
        position: getComputedStyle(dock).position,
        dockTop: dock.getBoundingClientRect().top,
        plotBottom: plot.getBoundingClientRect().bottom,
        boardOverflow: element.scrollHeight - element.clientHeight,
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(layout.position, `viewport ${width}`).toBe("static");
    expect(layout.dockTop).toBeGreaterThanOrEqual(layout.plotBottom);
    expect(layout.boardOverflow).toBeLessThanOrEqual(1);
    expect(layout.documentOverflow).toBeLessThanOrEqual(0);
  }

  await page.setViewportSize({ width: 360, height: 780 });
  const playerLink = page.getByRole("link", { name: "Управление опытом", exact: true });
  await expect(playerLink).toBeInViewport();
  await playerLink.press("Enter");
  await expect(page).toHaveURL(/#network-results$/);
  await expect(page.locator("#network-results")).toBeFocused();
  await expect(toolbar).toBeInViewport();
  await toolbar.getByRole("combobox", { name: "Скорость" }).selectOption("0.5");
  await toolbar.getByRole("button", { name: "Пуск" }).click();
  await expect.poll(async () => Number(await lab.getAttribute("data-current-time"))).toBeGreaterThan(0);
  await toolbar.getByRole("button", { name: "Пауза" }).click();
  await expect(toolbar.getByRole("button", { name: "Пуск" })).toBeEnabled();
  await toolbar.getByRole("button", { name: "Стоп" }).click();
  await expect(lab).toHaveAttribute("data-current-time", "0");

  await lab.getByRole("button", { name: "Очистить схему", exact: true }).click();
  await lab.getByRole("dialog").getByRole("button", { name: "Очистить", exact: true }).click();
  await expect(lab.getByRole("region", { name: "Управление опытом", exact: true })).toBeVisible();
  await expect(lab.getByRole("heading", { name: "Измерения" })).toHaveCount(0);
});
