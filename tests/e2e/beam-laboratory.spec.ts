import { expect, test, type Page } from "@playwright/test";
const route = "/ru/interactive/beam/";
async function open(page: Page, url = route) { await page.goto(url); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-ready", "true"); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status", "ok"); }
async function value(page: Page, id: string) { return Number((await page.locator(`[data-reaction="${id}"]`).innerText()).replace(/\s/g, "").replace(",", ".").replace("−", "-")); }
async function point(page: Page, x: number, y = 175) { await page.locator("[data-beam-scheme]").evaluate(node => node.scrollIntoView({block:"start",behavior:"instant"})); return page.locator("[data-beam-scheme]").evaluate((node, p) => { const matrix = (node as SVGSVGElement).getScreenCTM()!; const at = new DOMPoint(p.x, p.y).matrixTransform(matrix); return { x: at.x, y: at.y }; }, { x, y }); }
test("real local numerical path: reactions, section limits and drag updates before pointerup", async ({ page }) => {
  await open(page); expect(await value(page, "A-Fy")).toBe(5); expect(await value(page, "B-Fy")).toBe(5);
  await expect(page.locator("[data-beam-epure]")).toHaveCount(3);
  const from = await point(page, 510), to = await point(page, 310);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect.poll(() => value(page, "A-Fy")).toBeCloseTo(7.5, 2); await expect.poll(() => value(page, "B-Fy")).toBeCloseTo(2.5, 2);
  await page.mouse.up(); await page.getByRole("button", { name: "Отменить", exact: true }).click(); expect(await value(page, "A-Fy")).toBe(5);
  await page.getByRole("button", { name: "Повторить", exact: true }).click(); expect(await value(page, "A-Fy")).toBeCloseTo(7.5, 2);
  const second = await point(page, 310); await page.mouse.move(second.x, second.y); await page.mouse.down(); const toEnd = await point(page, 800); await page.mouse.move(toEnd.x, toEnd.y, { steps: 5 }); await page.keyboard.press("Escape"); await page.mouse.up(); expect(await value(page, "A-Fy")).toBeCloseTo(7.5, 2);
});
test("inline editing, sign, deletion and real zero epures", async ({ page }) => {
  await open(page); const editor = page.locator(".beam-inline-editor");
  await editor.getByLabel("Fy, kN", { exact: true }).fill("-8"); expect(await value(page, "A-Fy")).toBe(4);
  await editor.getByRole("button", { name: "Сменить направление" }).click(); expect(await value(page, "A-Fy")).toBe(-4);
  await editor.getByRole("button", { name: "Удалить F1" }).click(); await expect(page.locator("[data-beam-load]")).toHaveCount(0); expect(await value(page, "A-Fy")).toBe(0);
});
test("indeterminate fixed ends, section cursor/limits and variable stiffness editing", async ({ page }) => {
  await open(page); await page.getByLabel("Пример", { exact: true }).selectOption("fixed");
  expect(await value(page, "A-Fy")).toBe(8); expect(await value(page, "A-M")).toBeCloseTo(5.33333, 3); expect(await value(page, "B-M")).toBeCloseTo(-5.33333, 3);
  await page.getByLabel("Сечение x, m", { exact: true }).fill("2"); await expect(page.locator('[data-beam-value="M"]')).toContainText("2,6667");
  await page.getByRole("button", { name: "Разделить участок", exact: true }).click(); await page.getByLabel("EI2, MN·m²").fill("40"); await expect(page.locator("[data-beam-segment]")).toHaveCount(2); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status", "ok");
  expect(await value(page, "A-M")).not.toBeCloseTo(5.33333, 2);
});
test("units preserve model; cursor shows genuine left/right limits and toggles", async ({ page }) => {
  await open(page); await page.getByLabel("Единица длины").selectOption("mm"); await expect(page.getByLabel("Длина L, mm", { exact: true })).toHaveValue("4000");
  await page.getByLabel("Сечение x, mm", { exact: true }).fill("2000"); await page.getByLabel("Предел", { exact: true }).selectOption("left"); await expect(page.locator('[data-beam-value="Q"]')).toContainText("5 kN");
  await page.getByLabel("Предел", { exact: true }).selectOption("right"); await expect(page.locator('[data-beam-value="Q"]')).toContainText("-5 kN");
  await page.getByLabel("M(x)", { exact: true }).uncheck(); await expect(page.locator('[data-beam-epure="M"]')).toHaveCount(0); await page.getByLabel("M(x)", { exact: true }).check();
});
test("versioned JSON download, restore and rejected import preserve the current calculation", async ({ page }) => {
  await open(page); const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Сохранить схему", exact: true }).click(); expect((await downloaded).suggestedFilename()).toBe("ElectroTutor-beam.json");
  const saved = await page.evaluate(() => localStorage.getItem("electrotutor-beam-v1")!); expect(JSON.parse(saved).version).toBe(1);
  await page.getByLabel("Пример", { exact: true }).selectOption("left"); await page.getByRole("button", { name: "Восстановить сохранённую" }).click(); expect(await value(page, "A-Fy")).toBe(5);
  const upload = page.locator('input[type="file"]'); await upload.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":1,"length":0}') }); await expect(page.locator(".beam-message")).toContainText("Файл не принят"); expect(await value(page, "A-Fy")).toBe(5);
  const dto = JSON.parse(saved); dto.loads[0].value = -6000; await upload.setInputFiles({ name: "beam.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(dto)) }); expect(await value(page, "A-Fy")).toBe(3);
});
test("unstable schemes explain missing constraints and remove stale epures", async ({ page }) => {
  await open(page); await page.getByLabel("Конец балки 0", { exact: true }).selectOption("free"); await page.getByLabel("Конец балки L", { exact: true }).selectOption("free"); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status", "unstable"); await expect(page.getByRole("alert")).toContainText("Схема неустойчива"); await expect(page.locator("[data-beam-epure]")).toHaveCount(0);
});
test("load remains when dragged beyond the beam; palette drop and distributed endpoints edit", async ({ page }) => {
  await open(page); const from = await point(page, 510), outside = await point(page, 980); await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(outside.x, outside.y, { steps: 6 }); await page.mouse.up(); await expect(page.locator('[data-beam-load="F1"]')).toHaveAttribute("data-load-x", "4");
  await page.getByRole("button", { name: "Равномерная q +", exact: true }).click(); await expect(page.locator('[data-load-kind="distributed"]')).toHaveCount(1); await page.getByLabel("Начало a, m", { exact: true }).fill("1"); await page.getByLabel("Конец b, m", { exact: true }).fill("3"); await page.locator(".beam-inline-editor").getByLabel("q₁, kN/m", { exact: true }).fill("-6"); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status", "ok");
});
test("RU/UK, keyboard controls, mobile scrolling and theme keep state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, "/uk/interactive/beam/"); await expect(page.getByRole("heading", { name: "Опір матеріалів", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const viewport=await page.locator("[data-beam-viewport]").boundingBox();
  for(const control of await page.locator(".beam-inline-editor input,.beam-inline-editor button").all()){const box=await control.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(viewport!.x);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport!.x+viewport!.width);}

  await page.getByRole("button", { name: "Збільшити", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.locator("[data-beam-zoom]")).toContainText("125");
  await page.getByRole("button", {name:"Автомасштаб",exact:true}).click(); await expect(page.locator("[data-beam-zoom]")).toContainText("100"); await page.evaluate(() => document.documentElement.dataset.theme = "dark"); expect(await value(page, "A-Fy")).toBe(5); await page.addStyleTag({content:".header,.astro-header{visibility:hidden!important}"}); await expect(page.locator("[data-beam-viewport]")).toHaveScreenshot("beam-mobile-dark.png", { animations: "disabled" });
});


test("Ctrl-wheel anchors the section and ordinary wheel leaves scale alone", async ({page}) => {
  await open(page); const cursor = await point(page,510,175); await page.mouse.move(cursor.x,cursor.y);
  await page.keyboard.down("Control"); await page.mouse.wheel(0,-90); await page.keyboard.up("Control");
  await expect(page.locator("[data-beam-zoom]")).not.toHaveText("100%"); expect(await value(page,"A-Fy")).toBe(5);
  const after = await page.locator('[data-beam-load="F1"] line').evaluate(node=>{const p=new DOMPoint(510,175).matrixTransform(node.closest<SVGSVGElement>("svg")!.getScreenCTM()!);return {x:p.x,y:p.y};});
  expect(Math.abs(after.x-cursor.x)).toBeLessThan(3); expect(Math.abs(after.y-cursor.y)).toBeLessThan(3);
  const scale=await page.locator("[data-beam-zoom]").innerText(); await page.mouse.wheel(0,80); await expect(page.locator("[data-beam-zoom]")).toHaveText(scale);
});

test("touch movement updates the live solver and touchcancel rolls back without a history entry", async ({page}) => {
  await open(page); const from=await point(page,510,175), to=await point(page,310,175), cdp=await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:from.x,y:from.y,id:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:to.x,y:to.y,id:1}]});
  await expect.poll(()=>value(page,"A-Fy")).toBeCloseTo(7.5,2);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
  await expect.poll(()=>value(page,"A-Fy")).toBe(5); await expect(page.getByRole("button",{name:"Отменить",exact:true})).toBeDisabled();
});
test("native palette drag/drop creates one additional load", async ({page}) => {
  await page.setViewportSize({width:1280,height:1100}); await open(page); await page.getByRole("button",{name:"Сила F +",exact:true}).dragTo(page.locator("[data-beam-scheme]"),{targetPosition:{x:300,y:175}});
  await expect(page.locator('[data-load-kind="force"]')).toHaveCount(2); await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status","ok");
});



test("sign-changing linear q has a genuine zero section and opposite load arrows",async({page})=>{
  await open(page);await page.getByLabel("Пример",{exact:true}).selectOption("fixed");
  const editor=page.locator(".beam-inline-editor");await editor.getByLabel("q₀, kN/m",{exact:true}).fill("-1");await editor.getByLabel("q₁, kN/m",{exact:true}).fill("1");
  await expect(page.locator("[data-q-zero]")).toHaveAttribute("data-q-zero","2");
  const points=await page.locator("[data-distributed-profile]").getAttribute("points");expect(points!.split(" ")).toHaveLength(3);expect(points!.split(" ")[1]).toBe("510,210");
  const directions=await page.locator("[data-distributed-arrow] line").evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute("y2"))-Number(n.getAttribute("y1"))));expect(directions.some(d=>d>0)).toBe(true);expect(directions.some(d=>d<0)).toBe(true);
});


test("support coordinate edits and roller/fixed constraints remain mechanically distinct",async({page})=>{
  await open(page);await page.locator(".beam-element-list button").filter({hasText:/^A ·/}).click();
  const editor=page.locator(".beam-inline-editor");await editor.getByLabel("Координата x, m",{exact:true}).fill("0.5");expect(await value(page,"A-Fy")).toBeCloseTo(40/7,3);
  await page.getByLabel("Тип опоры",{exact:true}).selectOption("roller");await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status","unstable");
  await page.getByLabel("Тип опоры",{exact:true}).selectOption("fixed");await expect(page.locator("[data-beam-lab]")).toHaveAttribute("data-solver-status","ok");
  await editor.getByRole("button",{name:"Удалить A",exact:true}).click();await expect(page.locator("[data-beam-support]")).toHaveCount(1);
  await page.getByRole("button",{name:"Отменить",exact:true}).click();await expect(page.locator("[data-beam-support]")).toHaveCount(2);
});
