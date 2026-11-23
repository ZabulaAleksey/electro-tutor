import { expect, test } from "@playwright/test";
import { gotoLcBridge } from "./helpers/lc-bridge";
import { parallelInductorsDocument } from "../fixtures/lc-graphs";

test("displays exact equivalent connectivity for an imported LC graph", async ({ page }) => {
  await gotoLcBridge(page);
  const lab = page.locator("[data-lc-experiment][data-ready=true]");
  const panel = lab.locator("[data-lc-simplification]");
  await panel.getByText("Упрощённая схема", { exact: true }).click();
  await expect(panel.locator("[data-lc-simplified-branch]")).toHaveCount(5);
  await expect(panel.getByText("Однотипных последовательных и параллельных звеньев для свёртки нет.")).toBeVisible();

  await lab.locator('input[type="file"]').setInputFiles({
    name: "parallel-inductors.json", mimeType: "application/json", buffer: Buffer.from(parallelInductorsDocument()),
  });
  await expect(lab.locator('[data-line-glyph="C1"]')).toHaveCount(0);
  await lab.getByRole("button", { name: /Lэкв/ }).click();
  await expect(panel.locator("[data-lc-simplified-branch]")).toHaveCount(1);
  await expect(panel.locator("[data-lc-simplification-step]")).toContainText("L1 + L2");
  await expect(panel.locator("[data-lc-simplified-formula]")).toContainText("(q) / (1500)");
  await expect(lab.locator("[data-lc-formula]")).toContainText("(q) / (1500)");
  await expect(lab.locator('[data-line-glyph="L2"]')).toBeVisible();
});
