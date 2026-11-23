import { expect, type Page } from "@playwright/test";
import { reactiveLcMode } from "../../../src/circuit/reactive-lc-mode";

const lcExperimentRoute = "/ru/interactive/reactive-two-port-graph/experiment/";

export async function gotoLcBridge(page: Page, language: "ru" | "uk" = "ru") {
  const route = lcExperimentRoute.replace("/ru/", `/${language}/`);
  await page.goto(route);
  await expect(page.locator('[data-lc-experiment][data-ready="true"]')).toBeVisible();
  await loadDefaultBridge(page);
}

export async function loadDefaultBridge(page: Page) {
  await page.locator("[data-lc-import]").setInputFiles({
    name: "lc-bridge.json",
    mimeType: "application/json",
    buffer: Buffer.from(reactiveLcMode.createDefaultDocument()),
  });
  await expect(page.locator('[data-line-glyph="L3"]')).toBeVisible();
}

export async function removeBridgePart(page: Page, id: string) {
  await page.locator(`[data-line-component="${id}"]`).click();
  await page.locator("[data-line-remove]").click();
  await page.locator("[data-line-confirm-remove]").click();
}
