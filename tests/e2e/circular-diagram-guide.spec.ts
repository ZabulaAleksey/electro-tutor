import {expect,test} from "@playwright/test";
test("an example constructs the chord, radius and working point with reproducible parameters",async({page})=>{
 await page.goto("/ru/interactive/circular-diagram/");
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
