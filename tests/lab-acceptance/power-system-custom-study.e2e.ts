import { expect, test } from "@playwright/test";

test("runs both teaching methods on a network assembled from the UI", async ({ page }) => {
  await page.goto("/ru/interactive/power-system/");
  const lab = page.locator("[data-power-ready=true]");
  await lab.getByLabel("Учебная сеть").selectOption("ring");
  await lab.getByRole("button", { name: "Создать свою сеть" }).click();
  const author = lab.locator("[data-power-author]");
  await author.getByText("Собрать схему", { exact: true }).click();
  const add = author.getByRole("button", { name: "Добавить на схему" });
  await add.click();
  await add.click();
  const kind = author.getByLabel("Добавляемый элемент");
  await kind.selectOption("source");
  await add.click();

  const addLine = async (id: string, from: string, to: string) => {
    await kind.selectOption("line");
    await author.getByLabel("Первая шина").selectOption(from);
    await author.getByLabel("Вторая шина").selectOption(to);
    await add.click();
    await lab.getByLabel("Оборудование", { exact: true }).selectOption(id);
    await lab.getByLabel("Тип оборудования", { exact: true }).selectOption("ring-training-line@1");
  };
  await addLine("L1", "B1", "B2");
  await addLine("L2", "B2", "B3");
  await kind.selectOption("load");
  await author.getByLabel("Первая шина").selectOption("B3");
  await add.click();
  await lab.getByLabel("P, MW", { exact: true }).fill("8");
  await lab.getByLabel("Q, MVAr", { exact: true }).fill("2");
  await lab.getByRole("button", { name: "Применить нагрузку" }).click();

  const method = lab.getByLabel("Учебный метод своей сети");
  await method.selectOption("radial");
  await lab.getByRole("button", { name: "Рассчитать радиальную сеть" }).click();
  const node = lab.locator('[data-radial-bus="B3"]');
  await expect(node).toBeVisible();
  const voltage = Number(await node.getAttribute("data-radial-voltage"));
  expect(voltage).toBeGreaterThan(109);
  expect(voltage).toBeLessThan(110);

  await addLine("L3", "B3", "B1");
  await expect(lab.locator("[data-power-radial]").getByRole("status")).toContainText("замкнутый контур");
  await method.selectOption("ring");
  await expect(lab.locator("[data-ring-branch]")).toHaveCount(3);
  await lab.getByLabel("Условный разрез P").selectOption("B2");
  await expect(lab.locator('[data-power-calculation-cut="p:B2"]')).toHaveCount(1);
  await lab.getByRole("button", { name: "Уточнить режим кольца" }).click();
  await expect(lab.locator("[data-ring-refinement-result]")).toBeVisible();
  await lab.getByRole("button", { name: "Сравнить с Ybus" }).click();
  await expect(lab.locator("[data-ring-agreement-pass]")).toHaveAttribute("data-ring-agreement-pass", "true");
  await lab.getByRole("button", { name: "Рассчитать по Ybus" }).click();
  const ac = lab.locator("[data-ac-result]");
  await expect(ac.locator("[data-ac-branch]")).toHaveCount(3);
  expect(Number(await ac.getAttribute("data-ac-balance"))).toBeLessThan(1e-6);
});
