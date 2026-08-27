import { expect, test } from "@playwright/test";

const canonicalDefaults =
  "v=1&i0m=1.5&i0a=-18&ikm=8&ika=-55&zm=4&za=35&phi=25&r=43";

test("versioned share state is canonical and survives reload", async ({ page }) => {
  await page.goto(
    "/ru/interactive/?phi=-20&v=1&r=50&zm=12&i0m=2.75&i0a=10&ikm=9&ika=-40&za=15#shared",
  );

  await expect(page.locator(".circle-controls fieldset").first().getByRole("spinbutton").first())
    .toHaveValue("2.75");
  await expect(page.getByRole("slider")).toHaveValue("50");
  await expect(page).toHaveURL(new RegExp(`\\?v=1&i0m=2\\.75.*&r=50#shared$`));

  const canonicalUrl = page.url();
  await page.reload();
  expect(page.url()).toBe(canonicalUrl);
});

test("invalid and duplicate state recover safely with a visible notice", async ({ page }) => {
  await page.goto("/uk/interactive/?v=1&i0m=Infinity&i0m=2&r=-5#unsafe");

  await expect(page.getByRole("status")).toContainText("безпечні початкові значення");
  await expect(page.locator(".circle-controls fieldset").first().getByRole("spinbutton").first())
    .toHaveValue("1.5");
  expect(new URL(page.url()).search).toBe(`?${canonicalDefaults}`);
  expect(new URL(page.url()).hash).toBe("#unsafe");
});

test("numeric commits create history and back-forward restore UI", async ({ page }) => {
  await page.goto(`/ru/interactive/?${canonicalDefaults}`);
  const magnitude = page.locator(".circle-controls fieldset").first().getByRole("spinbutton").first();

  await magnitude.fill("3.5");
  await magnitude.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("i0m")).toBe("3.5");

  await page.goBack();
  await expect(magnitude).toHaveValue("1.5");
  await expect.poll(() => new URL(page.url()).searchParams.get("i0m")).toBe("1.5");

  await page.goForward();
  await expect(magnitude).toHaveValue("3.5");
  await expect.poll(() => new URL(page.url()).searchParams.get("i0m")).toBe("3.5");
});

test("range updates replace the current URL and language switch preserves it", async ({ page }) => {
  await page.goto("/ru/interactive/?i0m=2.75&r=50#state-vector");
  const slider = page.getByRole("slider");

  await slider.fill("60");
  await expect.poll(() => new URL(page.url()).searchParams.get("r")).toBe("60");
  await page.locator("a[data-language-link]").click();

  await expect(page).toHaveURL(/\/uk\/interactive\//);
  expect(new URL(page.url()).searchParams.get("v")).toBe("1");
  expect(new URL(page.url()).searchParams.get("r")).toBe("60");
  expect(new URL(page.url()).hash).toBe("#state-vector");
});
