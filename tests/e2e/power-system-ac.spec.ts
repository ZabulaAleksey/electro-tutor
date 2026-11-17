import { expect, test } from "@playwright/test";

test("calculates an imported two-loop physical network by Ybus", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Учебная сеть", { exact: true }).selectOption("ring");
  const network = {
    schemaVersion: 1,
    buses: ["A", "B", "C", "D"].map(id => ({ id, nominalKv: 110 })),
    elements: [
      { kind: "source", id: "S", busId: "A", inService: true, voltageKv: 110, angleDeg: 0 },
      ...[["AB", "A", "B"], ["BC", "B", "C"], ["CD", "C", "D"], ["DA", "D", "A"], ["AC", "A", "C"]]
        .map(([id, fromBusId, toBusId]) => ({ id, fromBusId, toBusId, kind: "line", inService: true,
          lengthKm: 10, parallelCircuits: 1, typeId: "ring-training-line", typeRevision: 1 })),
      { kind: "load", id: "D1", busId: "C", inService: true, activeMw: 8, reactiveMvar: 4 },
    ],
  };
  await lab.getByLabel("Импорт сети JSON").setInputFiles({
    name: "mesh.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(network)),
  });
  await expect(lab.getByLabel("Учебная сеть", { exact: true })).toHaveValue("custom");
  await expect(lab.locator("[data-circuit-editor]")).toHaveCount(1);
  await expect(lab.locator("[data-power-bus]")).toHaveCount(4);
  await lab.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  const result = lab.locator("[data-ac-result]");
  await expect(result.locator("[data-ac-branch]")).toHaveCount(5);
  expect(Number(await result.locator('[data-ac-bus="C"]').getAttribute("data-ac-voltage"))).toBeLessThan(110);
  expect(Number(await result.getAttribute("data-ac-balance"))).toBeLessThan(1e-6);
  expect(Number(await result.getAttribute("data-ac-mismatch"))).toBeLessThan(1e-6);
  await lab.getByLabel("Импорт сети JSON").setInputFiles({
    name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"schemaVersion": 1}'),
  });
  await expect(lab.getByRole("alert")).toContainText("Проверьте документ сети");
  await expect(result.locator("[data-ac-branch]")).toHaveCount(5);
});
