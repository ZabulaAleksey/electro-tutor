import { expect, test } from "@playwright/test";
import { defaultCircuitSettings, serializeCircuit } from "../../src/circuit/document";
import type { Drawing } from "../../src/circuit/drawing";
import type { Parameter } from "../../src/circuit/topology";

const graph = (reactive = false): Drawing => {
  type Part = [id: string, kind: string, parameters: Record<string, Parameter>];
  const parts: Part[] = [
    ["V1", "voltage", { voltageV: 100, resistanceOhm: 50 }],
    ["K1", "switch", { closed: true }],
    ["TL1", "line", { lengthM: 1e6, impedanceOhm: 50, velocityMS: 2e8 }],
    ["R1", reactive ? "l" : "r", reactive ? { henry: .02, initial: 1 } : { ohm: 20 }],
    ["R2", reactive ? "l" : "r", reactive ? { henry: .03, initial: 2 } : { ohm: 30 }],
  ];
  return {
    board: { width: 820, height: 360 },
    topology: {
      components: parts.map(([id, kind, parameters]) => ({ id, kind, parameters, terminals: [id + ":a", id + ":b"] })),
      junctions: [],
      wires: [
        ["V1:a", "K1:a"], ["K1:b", "TL1:a"], ["TL1:b", "R1:a"], ["R1:b", "R2:b"], ["R2:a", "V1:b"],
      ].map(([from, to], i) => ({ id: "W" + i, from, to })),
    },
    positions: {
      V1: { x: 90, y: 210, rotation: 90 },
      K1: { x: 220, y: 100, rotation: 0 },
      TL1: { x: 380, y: 100, rotation: 0 },
      R1: { x: 530, y: 100, rotation: 0 },
      R2: { x: 675, y: 210, rotation: 270 },
    },
    junctionPositions: {},
  };
};

test("runs a reduced free graph in the real Worker and restores measurements on original parts", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  const editor = lab.locator("[data-circuit-editor]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.getByText("Универсальный редактор схем", { exact: true }).click();
  const importDrawing = async (drawing: Drawing) => {
    const buffer = Buffer.from(serializeCircuit(drawing, defaultCircuitSettings));
    await editor.getByLabel("Импорт JSON").setInputFiles({ name: "free-line.json", mimeType: "application/json", buffer });
    await expect(editor.locator("[data-component-id]")).toHaveCount(5);
  };
  const calculate = editor.getByRole("button", { name: "Рассчитать эту схему", exact: true });
  await importDrawing(graph());
  const initialRevision = await lab.getAttribute("data-model-revision");
  await calculate.click();
  await expect(lab).not.toHaveAttribute("data-model-revision", initialRevision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");

  const verifyReadings = async () => {
    const cursor = lab.getByRole("slider", { name: "Курсор времени", includeHidden: true });
    await cursor.evaluate((element: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, "0.006");
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(editor.locator('[data-circuit-reading="R1"]')).toContainText(/20\s+В.*1\s+А/);
    await expect(editor.locator('[data-circuit-reading="R2"]')).toContainText(/[-−]30\s+В.*[-−]1\s+А/);
  };
  await verifyReadings();
  const readDraft = () => page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("electrotutor-line-draft-v5") ?? "{}");
    return {
      load: draft.model?.load,
      switch: draft.model?.series?.[0],
      ids: JSON.parse(draft.circuit ?? "{}").topology?.components.map((item: { id: string }) => item.id),
    };
  });
  await expect.poll(readDraft).toMatchObject({
    load: { id: expect.stringMatching(/^rlcEquivalent/), kind: "r", value: 50 },
    switch: { id: "K1", from: 0, to: 2, switch: { closed: true } },
    ids: ["V1", "K1", "TL1", "R1", "R2"],
  });
  await page.reload();
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.getByText("Универсальный редактор схем", { exact: true }).click();
  await verifyReadings();

  const acceptedRevision = await lab.getAttribute("data-model-revision");
  await importDrawing(graph(true));
  await calculate.click();
  await expect(lab.getByRole("alert")).toContainText(/Начальные напряжения C или токи L не согласованы.*R1, R2/);
  await expect(lab).toHaveAttribute("data-model-revision", acceptedRevision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
});
