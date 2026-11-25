import {expect,test} from "@playwright/test";
test("legacy query constructs the chord, radius and working point with reproducible parameters",async({page})=>{
 await page.goto("/ru/interactive/?v=1");
 await page.getByRole("button",{name:"Пример с дугой"}).click();
 await expect(page).toHaveURL(/ika=0.*za=60.*r=50/);
 await page.getByRole("button",{name:"Пошаговое построение"}).click();
 await expect(page.locator(".circle-guide [role=status]")).toContainText("1/3");
 await expect(page.locator(".current-locus")).toHaveCount(0);
 await page.getByRole("button",{name:"Далее",exact:true}).click();
 await expect(page.locator("[data-circle-radius]")).toContainText("1,155");
 await page.getByRole("button",{name:"Далее",exact:true}).click();
 await expect(page.locator(".current-locus")).toBeVisible();
 await expect(page.locator(".circle-readout")).toContainText("I(R)");
 await page.getByRole("button",{name:"Пример с прямой"}).click();
 await page.getByRole("button",{name:"Назад",exact:true}).click();
 await expect(page.locator(".circle-guide [role=status]")).toContainText("по прямой");
 await expect(page.locator("[data-circle-radius]")).toHaveCount(0);
 await page.goBack();
 await expect(page).toHaveURL(/ika=0.*za=60.*r=50/);
 const guide=page.getByRole("button",{name:"Пошаговое построение"});
 await expect(guide).toBeEnabled();
 if(await guide.getAttribute("aria-pressed")==="false"){
  await guide.click();
  await page.getByRole("button",{name:"Далее",exact:true}).click();
 }
 await expect(page.locator("[data-circle-radius]")).toContainText("1,155");
 await page.reload();
 await expect(page).toHaveURL(/ika=0.*za=60.*r=50/);
});

for (const language of ["ru", "uk"]) {
 test(`the ${language} dedicated laboratory always displays the complete locus`, async ({ page }) => {
  await page.goto(`/${language}/interactive/circular-diagram/`);
  const graph = page.locator(".circle-plot");
  const fullLocus = graph.locator(".current-locus");
  await expect(fullLocus).toBeVisible();
  await expect(graph.locator(".current-vector.active")).toBeVisible();
  await expect(page.getByRole("button", {name: /пошаговое построение|покрокова побудова|^Назад$|^(Далее|Далі)$/i})).toHaveCount(0);
  await expect(page.locator(".circle-guide-body, [data-circle-radius], .circle-construction")).toHaveCount(0);

  await page.getByRole("button", {name: /дугой|дугою/}).click();
  const arc = await fullLocus.getAttribute("d");
  await expect(page).toHaveURL(/ika=0.*za=60.*r=50/);
  const current = graph.locator(".current-vector.active circle");
  const before = await current.getAttribute("cx");
  await page.getByRole("slider").fill("75");
  await expect(current).not.toHaveAttribute("cx", before!);
  await expect(fullLocus).toHaveAttribute("d", arc!);

  await page.getByRole("button", {name: /прямой|прямою/}).click();
  await expect(page).toHaveURL(/ika=0.*za=0.*r=50/);
  await expect(fullLocus).not.toHaveAttribute("d", arc!);
  await expect(graph.locator(".current-vector.active")).toBeVisible();
 });
}
