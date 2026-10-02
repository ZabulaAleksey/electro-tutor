import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
for(const language of ["ru","uk"] as const){
 test(`RC1 ${language} public learner completes and resumes without mocked backend`,async({page})=>{
  const copy=JSON.parse(readFileSync(`src/i18n/${language}.json`,"utf8")).learning;
  await page.goto(`/${language}/topics/dc/mesh-current-method/`);
  await expect(page.getByRole("heading",{name:copy.practiceHeading})).toBeVisible();
  const answer=page.getByLabel(copy.practiceLabel);const check=page.getByRole("button",{name:copy.practiceCheck,exact:true});
  await answer.fill("not a number");await check.click();await expect(page.locator("#practice-feedback")).toHaveText(copy.practiceInvalid);
  await answer.fill("1.2");await check.click();await expect(page.locator("#practice-feedback")).toHaveText(copy.practiceIncorrect);
  await answer.fill(language==="ru"?"2,18":"2.18");await check.click();await expect(page.locator("#practice-feedback")).toHaveText(copy.practiceCorrect);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("potential-learning:v1:guest")||"{}").lessons?.["mesh-current-method"]?.completed)).toBe(true);
  const completedAt=await page.evaluate(()=>JSON.parse(localStorage.getItem("potential-learning:v1:guest")||"{}").lessons?.["mesh-current-method"]?.completedAt);
  await check.click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("potential-learning:v1:guest")||"{}").lessons?.["mesh-current-method"]?.completedAt)).toBe(completedAt);
  await page.goto(`/${language}/`);await expect(page.locator("[data-learning-summary]")).toContainText(copy.summaryComplete);
  await page.getByRole("link",{name:copy.summaryComplete,exact:true}).click();await expect(page).toHaveURL(new RegExp(`/${language}/topics/dc/mesh-current-method/#step-5$`));
  await expect(page.locator("#practice-feedback")).toHaveText(copy.practiceCorrect);
  await page.goto(`/${language}/account/`);await expect(page.locator("[data-learning-summary]")).toContainText(copy.summaryComplete);
 });
}

// Mock only the slow identity response; live signup separately proves the real consumer path.
test("RC1 delayed identity cannot write authenticated completion into guest storage", async ({ page }) => {
 await page.route("**/api/v1/me", async route => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({issuer:"https://identity.invalid/realms/learning",subject:"race-test"})});
 });
 await page.goto("/ru/topics/dc/mesh-current-method/");
 const answer=page.getByLabel("Ваш ответ");
 await expect(answer).toBeDisabled();
 await expect(answer).toBeEnabled();
 await answer.fill("2.18"); await page.getByRole("button",{name:"Проверить",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("potential-learning:v1:subject:")).some(k=>JSON.parse(localStorage.getItem(k)||"{}").lessons?.["mesh-current-method"]?.completed))).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("potential-learning:v1:guest")||"{}").lessons?.["mesh-current-method"]?.completed)).not.toBe(true);
 await page.reload();await expect(page.locator("#practice-feedback")).toContainText("Верно");
});

for(const language of ["ru","uk"])test(`RC1 ${language} all explanation levels survive reload`,async({page})=>{
 await page.goto(`/${language}/topics/dc/mesh-current-method/`);
 for(const level of [1,2,3]){
  const button=page.locator(".level-options button").nth(level-1);
  await button.click();await expect(button).toHaveClass(/selected/);
  expect(await page.evaluate(()=>localStorage.getItem("potential-level"))).toBe(String(level));
  await page.reload();await expect(page.locator(".level-options button").nth(level-1)).toHaveClass(/selected/);
  await expect(page.locator("main h1")).toBeVisible();await expect(page.locator(".circuit").first()).toBeVisible();
 }
});
