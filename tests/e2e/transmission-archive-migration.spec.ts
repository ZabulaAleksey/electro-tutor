import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const path = "/ru/interactive/transmission-line/";
const lab = (page: Page) => page.locator("[data-network-lab]");
const editor = (page: Page) => page.locator("[data-circuit-editor]");
const ready = (page: Page) => expect(lab(page)).toHaveAttribute("data-calculation-ready", "true");
const drawing = (page: Page) => editor(page).locator("svg[data-circuit-board]");
const line = { id: "TL1", lengthM: 1_000_000, impedanceOhm: 50, velocityMS: 200_000_000 };
const load = { id: "load", kind: "r", value: 50 };
const source = { voltageV: 100, resistanceOhm: 50, node: 0, onS: 0 };
const model = { sections: [line], load, source, durationS: .02, events: [], shunts: [] };

async function archive(page: Page, document: object) {
  await page.getByRole("button", { name: "Ещё инструменты и справка" }).click();
  await lab(page).locator('input[accept=".json,application/json"]').setInputFiles({
    name: "line-archive.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)),
  });
}

for (const version of [2, 3, 4, 5]) {
  test(`opens a v${version} archive as an editable universal graph`, async ({ page }) => {
    await page.goto(path);
    await expect(editor(page)).toHaveCount(1);
    await expect(page.locator("[data-network-canvas]")).toHaveCount(1);
    await expect(page.locator(".network-workspace, .network-schematic, .network-object-actions")).toHaveCount(0);
    await ready(page);
    const savedModel = version === 5 ? { ...model, sections: [{ ...line, resistanceOhmM: 1e-6 }] }
      : version === 4 ? { ...model, load: { id: "load", kind: "diode", diode: { saturationA: 1e-12, ideality: 1.5, reversed: false } } }
      : version === 3 ? { ...model, branches: [{ id: "R2", from: 0, to: 1, resistanceOhm: 75 }] } : model;
    await archive(page, { schema: `electrotutor-line-v${version}`, model: savedModel });
    await ready(page);
    await page.getByText("Универсальный редактор схем", { exact: true }).click();
    await expect(drawing(page).locator('[data-component-id="TL1"]')).toBeVisible();
    const revision = await lab(page).getAttribute("data-model-revision");
    await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("TL1");
    const length = editor(page).getByRole("spinbutton", { name: "Длина, m" });
    await expect(length).toHaveValue("1000000");
    await length.fill("750000");
    await length.press("Enter");
    await editor(page).getByRole("button", { name: "Рассчитать эту схему" }).click();
    await expect(lab(page)).not.toHaveAttribute("data-model-revision", revision!);
    await ready(page);
    await expect(drawing(page).locator('[data-circuit-reading="TL1"]')).toBeVisible();
    await page.reload();
    await ready(page);
    await page.getByText("Универсальный редактор схем", { exact: true }).click();
    await editor(page).getByLabel("Выбрать", { exact: true }).selectOption("TL1");
    await expect(length).toHaveValue("750000");
    await page.getByText("Экспорт результатов", { exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const file = await download;
    const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(exported.circuit.model).toEqual({
      ...savedModel, sections: [{ ...savedModel.sections[0], lengthM: 750_000 }],
    });
  });
}
