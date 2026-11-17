import { expect, test } from "@playwright/test";

test("selects matched load, short and open endings without drawing a wire", async ({ page }) => {
  await page.goto("/ru/interactive/transmission-line/");
  const lab = page.locator("[data-network-lab]");
  await expect(lab).toHaveAttribute("data-calculation-ready", "true");
  await page.getByRole("button", { name: "Ещё инструменты и справка", exact: true }).click();
  const ending = page.getByRole("combobox", { name: "Окончание линии", exact: true });
  for (const [kind, declared] of [["short", "wire"], ["open", "open"], ["load", "r"]] as const) {
    const previous = await lab.getAttribute("data-model-revision");
    await ending.selectOption(kind);
    await expect(lab).not.toHaveAttribute("data-model-revision", previous!);
    await expect(lab).toHaveAttribute("data-calculation-ready", "true");
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("electrotutor-line-draft-v5") ?? "{}").model?.load?.kind,
    )).toBe(declared);
  }
});
