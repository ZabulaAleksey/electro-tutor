import { expect, test } from "@playwright/test";

test("home uses the shared student shell and direct micro-lab cards", async ({ page }) => {
  await page.goto("/ru/");
  await expect(page.getByRole("link", { name: "Лаборатория", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Расчёт", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Доска", exact:true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Контакты" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Услуги" })).toHaveCount(0);
  await expect(page.locator(".lab-formats")).toHaveCount(0);
  await expect(page.locator("[data-learning-summary]")).toHaveCount(0);
  await expect(page.locator(".panorama-card")).toHaveCount(3);
  const firstHref = await page.locator(".micro-labs-home .micro-preview-card a").first().getAttribute("href");
  expect(firstHref).toMatch(/\/micro-labs\/#micro=/);
  await expect(page.locator(".micro-labs-home .micro-preview-card")).toHaveCount(6);
  await page.reload();
  await expect(page.locator(".micro-labs-home .micro-preview-card")).toHaveCount(6);
});

test("laboratory catalogue keeps real tool links and honest services state", async ({ page }) => {
  await page.goto("/ru/interactive/");
  await expect(page.getByRole("heading", { name: "Лаборатория", exact: true })).toBeVisible();
  await expect(page.locator(".tool-card")).toHaveCount(6);
  expect(await page.locator("h1").evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(44);
  await expect(page.locator(".tool-card a[href*='/interactive/star-neutral/']")).toBeVisible();
  await page.goto("/ru/my-services/");
  await expect(page.getByRole("heading", { name: "Мои сервисы", exact: true })).toBeVisible();
  await expect(page.getByText("Сервис пока не подключён.")).toBeVisible();
});

test("home preview opens the actual selected electrical model",async({page})=>{
 await page.goto("/ru/");await expect(page.locator("[data-home-ready]")).toHaveAttribute("data-home-ready","true");const link=page.locator(".micro-preview-card a").first();await expect(link).toBeVisible();const href=(await link.getAttribute("href"))!,id=new URL(href,"http://test").hash.split("=")[1];await link.click();const card=page.locator(`[data-micro="${id}"]`);await expect(card).toHaveAttribute("data-selected","true");await expect(page.locator(".micro-card[data-selected]")).toHaveCount(1);const value=await card.locator(".micro-results").textContent();await card.locator("input[type=range]").first().press("End");await expect(card.locator(".micro-results")).not.toHaveText(value!);
});

test("catalog cards fit phone in both themes and languages; selection stays stable during interaction",async({page})=>{
 await page.setViewportSize({width:390,height:844});for(const lang of ["ru","uk"]){await page.goto(`/${lang}/`);await expect(page.locator("[data-home-ready]")).toHaveAttribute("data-home-ready","true");await expect(page.locator(".micro-preview-card")).toHaveCount(6);const first=await page.locator(".micro-preview-card").evaluateAll(es=>es.map(e=>e.getAttribute("data-micro")));expect(new Set(first).size).toBe(6);await page.locator("#theme-toggle").click();expect(await page.locator(".micro-preview-card").evaluateAll(es=>es.map(e=>e.getAttribute("data-micro")))).toEqual(first);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.goto(`/${lang}/interactive/`);await expect(page.locator(".tool-card")).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);}
});
