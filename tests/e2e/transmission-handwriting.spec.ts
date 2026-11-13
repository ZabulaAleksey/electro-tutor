import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const route = "/ru/interactive/transmission-line/";
const drawing = (page: Page) => page.getByRole("button", { name: "Рисовать схему", exact: true });
const kind = (page: Page) => page.getByLabel("Распознанный элемент");
const insert = (page: Page) => page.getByRole("button", { name: "Вставить", exact: true });
const lab = (page: Page) => page.locator("[data-network-lab]");
async function stroke(page: Page, points: [number, number][]) {
  const canvas = page.locator("[data-network-canvas]");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + points[0][0], box.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 6 });
  await page.mouse.up();
}

test("a wire remains a wire and a marked line becomes a persisted solver section", async ({ page }, testInfo) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready", "true");
  await drawing(page).click();
  await stroke(page, [[390,260],[525,260]]);
  await expect(kind(page)).toHaveValue("wire");
  await insert(page).click();
  await expect(page.locator("[data-line-section]")).toHaveCount(1);
  await expect(page.locator("[data-detached=wire]")).toHaveCount(1);
  await page.getByRole("button",{name:"Очистить схему"}).click();
  await page.getByRole("button",{name:"Очистить",exact:true}).click();
  await drawing(page).click();
  await stroke(page, [[350,355]]);
  await stroke(page, [[540,390]]);
  await stroke(page, [[350,355],[445,373],[540,390]]);
  await expect(kind(page)).toHaveValue("line");
  await insert(page).click();
  const section = page.locator("[data-line-section=TL1]");
  await expect(section).toBeVisible();
  await expect(lab(page)).toHaveAttribute("data-calculation-ready", "true");
  await expect(section.locator(".network-transmission-stroke")).toHaveAttribute("transform", /^rotate\(10\./);
  const linePath = await section.locator(".network-transmission-stroke").getAttribute("d");
  await page.getByRole("button", { name: "Параметры", exact:true }).click();
  await expect(page.getByLabel("l, km")).toHaveValue("1000");
  await page.getByLabel("l, km").fill("500");
  await expect(lab(page)).toHaveAttribute("data-calculation-ready", "true");
  await page.getByRole("button",{name:"Закрыть панель"}).click();
  await page.getByRole("button",{name:"Отменить изменение"}).click();
  await page.getByRole("button",{name:"Отменить изменение"}).click();
  await expect(section).toHaveCount(0);
  await page.getByRole("button",{name:"Повторить изменение"}).click();
  await expect(section).toHaveCount(1);
  await page.reload();
  await expect(section.locator(".network-transmission-stroke")).toHaveAttribute("d",linePath!);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready", "true");
  await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Сохранить схему",exact:true}).click();
  const json = testInfo.outputPath("drawn-line.json");
  await (await download).saveAs(json);
  const data = JSON.parse(await readFile(json,"utf8"));
  expect(data.model.sections.map((item: {id:string})=>item.id)).toEqual(["TL1"]);
  expect(data.ink[0]).toHaveLength(3);
  await page.locator('input[accept=".json,application/json"]').setInputFiles(json);
  await expect(section.locator(".network-transmission-stroke")).toHaveAttribute("d",linePath!);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
});

test("the display convention changes a drawn resistor without changing the electrical model", async ({ page }) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  const canvas = page.locator("[data-network-canvas]");
  const area = (await canvas.boundingBox())!;
  const signal = await canvas.locator(".network-junction").first().boundingBox();
  expect(signal).not.toBeNull();
  const x = signal!.x+signal!.width/2-area.x, y = signal!.y+signal!.height/2-area.y;
  await stroke(page,[[x+18,y+56],[x+26,y+49],[x+34,y+63],[x+42,y+49],[x+50,y+63],[x+58,y+49],[x+66,y+63],[x+74,y+56]]);
  await expect(kind(page)).toHaveValue("r");
  await insert(page).click();
  const resistor = page.locator("[data-detached=r]");
  await expect(resistor).toHaveCount(1);
  const revision = await lab(page).getAttribute("data-model-revision");
  await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
  await page.getByLabel("УГО резисторов").selectOption("ansi");
  await expect(resistor.locator('[data-symbol=resistor] rect')).toHaveCount(0);
  await expect(resistor.locator('[data-symbol=resistor] path')).toHaveCount(2);
  await expect(lab(page)).toHaveAttribute("data-model-revision",revision!);
});

test("a drawn current source drives the existing line from its selected node", async ({ page }) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  const canvas = page.locator("[data-network-canvas]");
  const area = (await canvas.boundingBox())!;
  const signal = (await canvas.locator(".network-junction").first().boundingBox())!;
  const x = signal.x+signal.width/2-area.x, y = signal.y+signal.height/2-area.y;
  const perimeter = Array.from({length:25},(_,i):[number,number]=>[x+20*Math.cos(i*Math.PI/12),y+20*Math.sin(i*Math.PI/12)]);
  await stroke(page,perimeter);
  await stroke(page,[[x,y+11],[x,y-11],[x-5,y-3]]);
  await stroke(page,[[x,y-11],[x+5,y-3]]);
  await expect(kind(page)).toHaveValue("current");
  await insert(page).click();
  await expect(page.locator('[data-symbol="current-source"]')).toBeVisible();
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await page.getByRole("button",{name:"Параметры",exact:true}).click();
  await expect(page.getByLabel("I, A")).toHaveValue("1");
});

test("crossing touch strokes remain unconnected without explicit endpoints", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch:true,isMobile:true,viewport:{width:390,height:844} });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
    await drawing(page).tap();
    const canvas = page.locator("[data-network-canvas]");
    await canvas.scrollIntoViewIfNeeded();
    const rect = (await canvas.boundingBox())!;
    const touch = await context.newCDPSession(page);
    async function gesture(points: [number, number][]) {
      for (const [index,[x,y]] of points.entries()) {
        await touch.send("Input.dispatchTouchEvent",{type:index?"touchMove":"touchStart",
          touchPoints:[{x:rect.x+x,y:rect.y+y}]});
      }
      await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }
    const before = await lab(page).getAttribute("data-model-revision");
    await gesture([[90,205],[160,275]]);
    await expect(kind(page)).toHaveValue("wire");
    await gesture([[160,205],[90,275]]);
    await expect(kind(page)).toHaveValue("");
    await expect(insert(page)).toBeDisabled();
    await expect(lab(page)).toHaveAttribute("data-model-revision",before!);
    await expect(canvas.locator("[data-contact]")).toHaveCount(0);
  } finally { await context.close(); }
});

test("a straight ink stroke between named circuit nodes creates an explicit bridge", async ({ page }, testInfo) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  const canvas = page.locator("[data-network-canvas]");
  const box = (await canvas.boundingBox())!;
  const junctions = canvas.locator(".network-junction");
  const a = (await junctions.nth(0).boundingBox())!, b = (await junctions.nth(1).boundingBox())!;
  await stroke(page,[[a.x+a.width/2-box.x,a.y+a.height/2-box.y],[b.x+b.width/2-box.x,b.y+b.height/2-box.y]]);
  await expect(kind(page)).toHaveValue("wire");
  await insert(page).click();
  await expect(canvas.locator("[data-contact=W1]")).toHaveCount(1);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button",{name:"Сохранить схему",exact:true}).click();
  const json = testInfo.outputPath("drawn-bridge.json");
  await (await download).saveAs(json);
  const data = JSON.parse(await readFile(json,"utf8"));
  expect(data.model.branches).toEqual([{id:"W1",from:0,to:1}]);
  expect(data.model.sections).toHaveLength(1);
});

test("ground ink at the open terminal produces a real short to the reference", async ({ page }) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  const canvas = page.locator("[data-network-canvas]");
  const area = (await canvas.boundingBox())!;
  const node = (await canvas.locator(".network-junction").nth(1).boundingBox())!;
  const x = node.x+node.width/2-area.x, y = node.y+node.height/2-area.y;
  await stroke(page,[[x-18,y-6],[x+18,y-6]]);
  await stroke(page,[[x-12,y],[x+12,y]]);
  await stroke(page,[[x-6,y+6],[x+6,y+6]]);
  await expect(kind(page)).toHaveValue("ground");
  await insert(page).click();
  await expect(canvas.locator('[data-symbol="ground"]')).toBeVisible();
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await expect.poll(async()=>page.evaluate(()=>{
    const saved=localStorage.getItem("electrotutor-line-draft-v5");
    return saved ? JSON.parse(saved).model.load.kind : null;
  })).toBe("wire");
});

test("a marked line in empty space cannot silently attach to an existing chain", async ({ page }) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  await stroke(page,[[350,355]]);
  await stroke(page,[[540,390]]);
  await stroke(page,[[350,355],[540,390]]);
  await expect(kind(page)).toHaveValue("line");
  const revision = await lab(page).getAttribute("data-model-revision");
  await insert(page).click();
  await expect(page.locator("[data-line-section]")).toHaveCount(1);
  await expect(lab(page)).toHaveAttribute("data-model-revision",revision!);
  await expect(kind(page)).toHaveValue("line");
});

test("one marked endpoint can extend the existing line at its last node", async ({ page }) => {
  await page.setViewportSize({width:1000,height:900});
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
  await drawing(page).click();
  const canvas = page.locator("[data-network-canvas]");
  const area = (await canvas.boundingBox())!;
  const node = (await canvas.locator(".network-junction").nth(1).boundingBox())!;
  const x = node.x+node.width/2-area.x, y = node.y+node.height/2-area.y;
  await stroke(page,[[x,y]]);
  await stroke(page,[[x+125,y-85]]);
  await stroke(page,[[x,y],[x+125,y-85]]);
  await expect(kind(page)).toHaveValue("line");
  await insert(page).click();
  await expect(canvas.locator("[data-line-section=TL2]")).toBeVisible();
  await expect(lab(page)).toHaveAttribute("data-calculation-ready","true");
});
