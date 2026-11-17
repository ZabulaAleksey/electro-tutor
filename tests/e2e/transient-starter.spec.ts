import { expect, test } from "@playwright/test";

test("a new transient experiment switches the source independently of the line ending", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const canvas = page.locator("[data-network-canvas]");
  await expect(canvas.locator("[data-line-section]")).toHaveCount(1);
  await expect(canvas.getByRole("button", { name: "Источник", exact: true })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Нагрузка", exact: true })).toBeVisible();
  await expect(canvas.getByRole("button", { name: /щуп/i })).toHaveCount(0);
  await page.getByRole("slider", { name: "Точка наблюдения x", exact: true }).press("End");
  const timing = page.locator(".network-timing");
  const sampleAtSixMilliseconds = async () => {
    if (await timing.getAttribute("open") === null) await timing.locator("summary").click();
    await page.getByRole("spinbutton", { name: "Физическое время t, ms", exact: true }).fill("6");
  };
  await sampleAtSixMilliseconds();
  await expect(lab).toHaveAttribute("data-probe-u", "0");
  await timing.locator("summary").click();

  const key = canvas.getByRole("button", { name: /· Ключ$/i });
  await key.press("Enter");
  const position = page.getByRole("combobox", { name: "Начальное состояние", exact: true });
  await expect(position).toHaveValue("false");
  await position.selectOption("true");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.locator(".network-tray-close").click();
  await sampleAtSixMilliseconds();
  await expect.poll(async () => Number(await lab.getAttribute("data-probe-u"))).toBeGreaterThan(0);
  await expect.poll(async () => Number(await lab.getAttribute("data-probe-i"))).toBeGreaterThan(0);

  await timing.locator("summary").click();
  await key.press("Enter");
  await position.selectOption("false");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.locator(".network-tray-close").click();
  await sampleAtSixMilliseconds();
  await expect(lab).toHaveAttribute("data-probe-u", "0");
  await expect(lab).toHaveAttribute("data-probe-i", "0");
  await page.reload();
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await key.press("Enter");
  await expect(position).toHaveValue("false");
  await page.locator(".network-inspector").getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(key).toHaveCount(0);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.getByRole("button", { name: "Элементы", exact: true }).click();
  await page.getByRole("button", { name: "Ключ", exact: true }).click();
  await canvas.getByRole("button", { name: "Перед первой секцией", exact: true }).press("Enter");
  await expect(key).toHaveCount(1);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
});

test("adds a resistor to the matched load without selecting a nonexistent group symbol", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  const revision = await lab.getAttribute("data-model-revision");
  await lab.getByRole("button", { name: "Нагрузка", exact: true }).press("Enter");
  await lab.locator(".network-inspector").getByRole("button", { name: "+ R", exact: true }).click();
  await expect(lab).not.toHaveAttribute("data-model-revision", revision!);
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem("electrotutor-line-draft-v5") ?? "{}",
  ).model?.load?.children?.map((item: { value: number }) => item.value))).toEqual([50, 50]);
  expect(pageErrors).toEqual([]);
});
