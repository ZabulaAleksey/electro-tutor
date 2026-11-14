import { expect, test, type Page } from "@playwright/test";

const path = "/ru/interactive/transmission-line/";
const canvas = (page: Page) => page.locator("[data-network-canvas]");
const ready = (page: Page) => expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready", "true");
const sections = (page: Page) => page.locator("[data-line-section]");
const position = (page: Page, x: number, y: number) => canvas(page).locator(".network-schematic-drawing").evaluate((element, point) => {
  const matrix = (element as SVGGElement).getScreenCTM()!;
  const { x, y } = new DOMPoint(point.x, point.y).matrixTransform(matrix);
  return { x, y };
}, { x, y });
const middle = async (locator: ReturnType<Page["locator"]>) => {
  const rect = await locator.boundingBox();
  if (!rect) throw Error("Missing control bounds");
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

test("home opens the topic catalogue, and pointer drag commits only at the highlighted end", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("/ru/");
  await page.getByRole("link", { name: "Выбрать лабораторию", exact: true }).click();
  await expect(page.locator(".site-footer").getByRole("link", { name: "Учебник", exact: true })).toHaveAttribute("href", "/ru/topics/");
  await page.getByRole("link", { name: "Переходные процессы в длинных линиях", exact: true }).click();
  await ready(page);

  await page.getByRole("button",{name:"Элементы",exact:true}).click();
  await page.locator('[data-network-tool="line"]').scrollIntoViewIfNeeded();
  const from = await middle(page.locator('[data-network-tool="line"]'));
  const target = await position(page, 277, 65);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await expect(canvas(page).locator('[data-placement="end"]')).toHaveAttribute("data-snapped", "true");
  await expect(sections(page)).toHaveCount(1);
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(2);
  await ready(page);

  await page.getByRole("button", { name: "Отменить изменение" }).click();
  await expect(sections(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Повторить изменение" }).click();
  await expect(sections(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Ещё инструменты и справка" }).click();
  await expect(page.getByText("Как распространяются волны")).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(sections(page)).toHaveCount(2);
  expect(failures).toEqual([]);
});

test("invalid and canceled drops preserve the existing circuit", async ({ page }) => {
  await page.goto(path);
  await ready(page);
  await page.getByRole("button",{name:"Элементы",exact:true}).click();
  await page.locator('[data-network-tool="line"]').scrollIntoViewIfNeeded();
  const from = await middle(page.locator('[data-network-tool="line"]'));
  const invalid = await position(page, 145, 105);
  const valid = await position(page, 277, 65);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(invalid.x, invalid.y, { steps: 8 });
  await expect(canvas(page).locator('[data-snapped=true]')).toHaveAttribute("data-allowed", "false");
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(1);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(valid.x, valid.y, { steps: 8 });
  await expect(canvas(page).locator('[data-snapped=true]')).toHaveAttribute("data-allowed", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(sections(page)).toHaveCount(1);
  await expect(canvas(page).locator("[data-placement]")).toHaveCount(0);
});

test("keyboard places a line and the inspector removes it", async ({ page }) => {
  await page.goto(path);
  await ready(page);
  await page.getByRole("button",{name:"Элементы",exact:true}).click();
  const add = page.getByRole("button", { name: "Линия передачи", exact: true });
  await add.press("Enter");
  const target = canvas(page).getByRole("button", { name: "Конец линии" });
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sections(page)).toHaveCount(2);
  await canvas(page).getByRole("button", { name: "TL2 · линия" }).press("Enter");
  await page.locator("[data-line-inspector]").getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(sections(page)).toHaveCount(1);
  await ready(page);
});

test.describe("touch workspace", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("drag, tap, edit, move and remove with touch input", async ({ page, context }) => {
    await page.goto(path);
    await ready(page);
    const session = await context.newCDPSession(page);
    const dispatch = (type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id?: number }>) =>
      session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const toolbar = page.getByRole("group", { name: "Управление конструктором" });
    await toolbar.getByRole("button", { name: "Элементы" }).tap();
    await page.locator('[data-network-tool="r"]').scrollIntoViewIfNeeded();
    const start = await middle(page.locator('[data-network-tool="r"]'));
    const target = await position(page, 145, 155);
    await dispatch("touchStart", [start]);
    await dispatch("touchMove", [{ x: start.x, y: start.y - 26 }]);
    await dispatch("touchMove", [target]);
    await expect(canvas(page).locator('[data-placement="branch-span"][data-snapped=true]')).toHaveAttribute("data-allowed", "true");
    const ghost = await page.locator(".network-drag-ghost").boundingBox();
    expect(ghost!.y + ghost!.height / 2).toBeLessThan(target.y - 20);
    await dispatch("touchEnd", []);
    await expect(sections(page)).toHaveCount(2);
    await ready(page);

    await canvas(page).getByRole("button", { name: "R1 · Резистор" }).tap();
    const resistance = page.locator("[data-line-inspector]").getByRole("spinbutton", { name: "Сопротивление R, Ω" });
    await resistance.fill("125");
    await expect(page.getByRole("group",{name:"Управление симуляцией"})).toBeVisible();
    await page.locator("[data-line-inspector]").getByRole("button", { name: "Переподключить" }).tap();
    await canvas(page).getByRole("button", { name: "Шунт к опоре · 0" }).tap();
    await canvas(page).getByRole("button", { name: "R1 · Резистор" }).tap();
    await expect(resistance).toHaveValue("125");
    await page.locator("[data-line-inspector]").getByRole("button", { name: "Удалить" }).tap();
    await expect(canvas(page).getByRole("button", { name: "R1 · Резистор" })).toHaveCount(0);

    await toolbar.getByRole("button", { name: "Элементы" }).tap();
    await page.locator('[data-network-tool="r"]').tap();
    await canvas(page).getByRole("button", { name: "Конец линии" }).tap();
    await ready(page);
    const original = await canvas(page).getAttribute("data-zoom");
    await canvas(page).scrollIntoViewIfNeeded();
    const origin = await position(page, 300, 175);
    await dispatch("touchStart", [{ x: origin.x - 30, y: origin.y, id: 1 }, { x: origin.x + 30, y: origin.y, id: 2 }]);
    await dispatch("touchMove", [{ x: origin.x - 75, y: origin.y, id: 1 }, { x: origin.x + 75, y: origin.y, id: 2 }]);
    await dispatch("touchEnd", []);
    await expect(canvas(page)).not.toHaveAttribute("data-zoom", original!);
    await page.getByRole("button", { name: "Показать всю схему" }).tap();
    await expect(canvas(page)).toHaveAttribute("data-zoom", original!);
    await expect(sections(page)).toHaveCount(2);
  });

  test("touch drags a detached diode and attaches it to an intermediate branch",async({page,context})=>{
    await page.goto(path);
    await ready(page);
    const session=await context.newCDPSession(page);
    await page.getByRole("button",{name:"Элементы",exact:true}).tap();
    const diode=page.locator('[data-network-tool="diode"]');
    await diode.scrollIntoViewIfNeeded();
    const palette=await middle(diode);
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest("[data-network-tool]")?.getAttribute("data-network-tool"),palette)).toBe("diode");
    const blank=await position(page,460,115);
    await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[palette]});
    await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:palette.x,y:palette.y-26}]});
    await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[blank]});
    await expect(page.locator(".network-drag-ghost")).toBeVisible();
    await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const field=canvas(page),draft=field.locator('[data-detached="diode"]');
    await expect(draft).toBeVisible();
    await draft.tap();
    await page.getByRole("button",{name:"Подключить",exact:true}).tap();
    await expect(field).toHaveAttribute("data-placing","true");
    await field.getByRole("button",{name:"Шунт к опоре · TL1"}).tap();
    await ready(page);
    await expect(draft).toHaveCount(0);
    await field.locator("[data-contact=VD1]").press("Enter");
    await page.getByText("Вольт-амперная характеристика",{exact:true}).tap();
    await expect(page.locator("[data-diode-point]")).toHaveAttribute("data-diode-voltage","0");
    await page.locator(".network-timing summary").tap();
    await page.getByLabel("Физическое время t, ms").fill("3");
    await expect.poll(async()=>Number(await page.locator("[data-diode-point]").getAttribute("data-diode-voltage"))).toBeGreaterThan(.5);
  });

  for (const [width, height] of [[320, 650], [430, 932], [768, 1024], [844, 390], [1280, 800]]) {
    test(`toolbar fits and stays available at ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await ready(page);
      const toolbar = page.getByRole("group", { name: "Управление симуляцией" });
      await page.locator("#network-results").scrollIntoViewIfNeeded();
      await expect(toolbar).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const buttons = await toolbar.getByRole("button").evaluateAll(elements => elements.map(el => {
        const rect = el.getBoundingClientRect();
        return Math.min(rect.width, rect.height);
      }));
      expect(Math.min(...buttons)).toBeGreaterThanOrEqual(44);
    });
  }
});


test("transport preserves phase on pause and resets time without editing the circuit",async({page})=>{
 await page.goto(path);
 await ready(page);
 const lab=page.locator("[data-network-lab]");
 const bar=page.getByRole("group",{name:"Управление симуляцией"});
 const speed=bar.getByLabel("Скорость");
 await expect(speed.locator("option")).toHaveText(["×1/16","×1/8","×1/4","×1/2","×1","×2","×4","×8","×16","×32"]);
 await expect(speed).toHaveValue("1");
 await expect(page.getByRole("heading",{name:"Подробные параметры"})).toHaveCount(0);
 const revision=await lab.getAttribute("data-model-revision");
 await bar.getByRole("button",{name:/Пуск$/}).click();
 await expect.poll(async()=>Number(await lab.getAttribute("data-current-time"))).toBeGreaterThan(.001);
 await bar.getByRole("button",{name:/Пауза$/}).click();
 const paused=await lab.getAttribute("data-current-time");
 await speed.selectOption("0.5");
 await expect(lab).toHaveAttribute("data-current-time",paused!);
 await bar.getByRole("button",{name:/Пуск$/}).click();
 await expect.poll(async()=>Number(await lab.getAttribute("data-current-time"))).toBeGreaterThan(Number(paused));
 await bar.getByRole("button",{name:/Стоп$/}).click();
 await expect(lab).toHaveAttribute("data-current-time","0");
 await expect(lab).toHaveAttribute("data-model-revision",revision!);
});

test("visual series key changes both the symbol and worker result at the scheduled instant",async({page})=>{
 await page.goto(path);
 await ready(page);
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.locator('[data-network-tool="switch"]').click();
 await canvas(page).getByRole("button",{name:"В разрыв линии · TL1"}).press("Enter");
 await ready(page);
 await expect(sections(page)).toHaveCount(2);
 const key=canvas(page).getByRole("button",{name:"K1 · Ключ"});
 await key.press("Enter");
 await page.getByLabel("Коммутация",{exact:true}).check();
 await page.getByLabel("Время коммутации, мс",{exact:true}).fill("4");
 await ready(page);
 await page.locator(".network-tray-close").click();
 await page.getByRole("slider",{name:"Точка наблюдения x"}).press("End");
 await page.locator(".network-timing summary").click();
 const time=page.getByLabel("Физическое время t, ms");
 const lab=page.locator("[data-network-lab]");
 await time.fill("3");
 await expect(key).toHaveAttribute("data-closed","false");
 await expect(lab).toHaveAttribute("data-probe-u","0");
 await time.fill("7");
 await expect(key).toHaveAttribute("data-closed","true");
 await expect.poll(async()=>Number(await lab.getAttribute("data-probe-u"))).toBeGreaterThan(0);
});


test("selects both bridge ends, switches the branch and restores its v3 JSON",async({page},testInfo)=>{
 await page.goto(path);
 await ready(page);
 const scheme=canvas(page);
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.locator('[data-network-tool="r"]').click();
 await scheme.getByRole("button",{name:"Начать перемычку от узла 0"}).press("Enter");
 await scheme.getByRole("button",{name:"Узел соединения · 1"}).press("Enter");
 await ready(page);
 const link=scheme.getByRole("button",{name:"R1 · Резистор"});
 await link.press("Enter");
 await page.getByRole("spinbutton",{name:"Сопротивление R, Ω"}).fill("80");
 await page.locator(".network-tray-close").click();
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.locator('[data-network-tool="switch"]').click();
 await scheme.getByRole("button",{name:/Ключ в существующую ветвь/}).press("Enter");
 await ready(page);
 const key=scheme.getByRole("button",{name:"R1 · Ключ"});
 await expect(key).toHaveAttribute("data-closed","true");
 await page.reload();
 await ready(page);
 await expect(key).toHaveAttribute("data-closed","true");
 await key.press("Enter");
 await expect(page.getByRole("spinbutton",{name:"Сопротивление R, Ω"})).toHaveValue("80");
 await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
 const downloaded=page.waitForEvent("download");
 await page.getByRole("button",{name:"Сохранить схему"}).click();
 const file=await downloaded;
 const exportedPath=testInfo.outputPath("transmission-line.json");
 await file.saveAs(exportedPath);
 const json=JSON.parse(await (await import("node:fs/promises")).readFile(exportedPath,"utf8"));
 expect(json.schema).toBe("electrotutor-line-v3");
 expect(json.model.branches).toEqual([{id:"R1",from:0,to:1,resistanceOhm:80,switch:{closed:true}}]);
 await page.locator('input[accept=".json,application/json"]').setInputFiles({name:"legacy.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify({schema:"electrotutor-line-v2",model:{...json.model,branches:undefined},layout:{}}))});
 await ready(page);
 await expect(key).toHaveCount(0);
 await page.locator('input[accept=".json,application/json"]').setInputFiles(exportedPath);
 await ready(page);
 await expect(key).toHaveAttribute("data-closed","true");
});


test("wheel scrolls normally, Ctrl anchors zoom and geometry does not change the solver",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page), lab=page.locator("[data-network-lab]");
 const initial=await field.getAttribute("data-zoom");
 await field.scrollIntoViewIfNeeded();
 const pivot=await position(page,145,105);
 await page.mouse.move(pivot.x,pivot.y);await page.mouse.wheel(0,100);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
 await expect(field).toHaveAttribute("data-zoom",initial!);
 await field.scrollIntoViewIfNeeded();
 const center=await position(page,145,105);
 await page.mouse.move(center.x,center.y);await page.keyboard.down("Control");
 await page.mouse.wheel(0,-160);await page.keyboard.up("Control");
 await expect(field).not.toHaveAttribute("data-zoom",initial!);
 const anchored=await position(page,145,105);
 expect(Math.hypot(anchored.x-center.x,anchored.y-center.y)).toBeLessThan(1);
 await page.getByRole("button",{name:"Показать всю схему"}).click();
 const rev=await lab.getAttribute("data-model-revision");
 const section=field.locator("[data-line-section=TL1]");
 await section.scrollIntoViewIfNeeded();
 const before=await section.getAttribute("transform");
 const start=await position(page,145,105);
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(start.x,start.y+42,{steps:6});await page.mouse.up();
 await expect(section).not.toHaveAttribute("transform",before!);
 await expect(lab).toHaveAttribute("data-model-revision",rev!);
});

test("cursor placement, ordinary wire and nonlinear diode use the real solver",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page);
 const part=async(tool:string)=>{
  await page.getByRole("button",{name:"Элементы",exact:true}).click();
  await page.locator(`[data-network-tool="${tool}"]`).click();
 };
 await part("wire");
 const end=await position(page,277,65);
 await page.mouse.move(end.x,end.y);
 await expect(page.locator(".network-drag-ghost")).toBeVisible();
 await page.mouse.click(end.x,end.y);
 await ready(page);
 const shortedLoad = field.getByRole("button",{name:"Нагрузка",exact:true});
 await expect(field.locator("[data-load-lead]")).toHaveCount(2);
 await expect(shortedLoad.locator("g path")).toHaveAttribute("d","M-24 0H24");
 await part("diode");
 await field.getByRole("button",{name:"Конец линии",exact:true}).press("Enter");
 await ready(page);
 await field.getByRole("button",{name:"Нагрузка",exact:true}).press("Enter");
 await page.getByText("Вольт-амперная характеристика",{exact:true}).click();
 await expect(page.locator("[data-diode-point]")).toHaveAttribute("data-diode-voltage","0");
 await page.locator(".network-timing summary").click();
 await page.getByLabel("Физическое время t, ms").fill("6");
 await expect.poll(async()=>Number(await page.locator("[data-diode-point]").getAttribute("data-diode-voltage"))).toBeGreaterThan(.5);
 await expect.poll(async()=>Number(await page.locator("[data-diode-point]").getAttribute("data-diode-voltage"))).toBeLessThan(2);
 await page.locator(".network-timing summary").click();
 await page.getByRole("button",{name:"Развернуть диод"}).click();
 await ready(page);
 await page.locator(".network-timing summary").click();
 await page.getByLabel("Физическое время t, ms").fill("6");
 await expect.poll(async()=>Number(await page.locator("[data-diode-point]").getAttribute("data-diode-voltage"))).toBeLessThan(-100);
});


test("ordinary R, L and C terminate the line and deleting the load opens the branch",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page),lab=page.locator("[data-network-lab]");
 for(const [tool,symbol,method] of [
   ["r","resistor","exact-fronts"],["l","inductor","characteristics-trapezoid"],["c","capacitor","characteristics-trapezoid"],
 ]){
   await page.getByRole("button",{name:"Элементы",exact:true}).click();
   await page.locator(`[data-network-tool="${tool}"]`).click();
   await field.getByRole("button",{name:"Конец линии",exact:true}).press("Enter");
   await ready(page);
   const load=field.getByRole("button",{name:"Нагрузка",exact:true});
   await expect(load.locator(`[data-symbol="${symbol}"]`)).toBeVisible();
   await expect(lab).toHaveAttribute("data-method",method);
 }
 await field.getByRole("button",{name:"Нагрузка",exact:true}).press("Enter");
 await page.locator(".network-inspector").getByRole("button",{name:"Удалить",exact:true}).click();
 await ready(page);
 await expect(field.getByRole("button",{name:"Нагрузка",exact:true}).locator("circle")).toHaveCount(2);
 await expect(lab).toHaveAttribute("data-method","exact-fronts");
});

test("a detached capacitor moves freely, survives reload, then connects and rewires through the worker",async({page})=>{
 await page.goto(path);
 await ready(page);
 const field=canvas(page),lab=page.locator("[data-network-lab]");
 const revision=await lab.getAttribute("data-model-revision");
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.locator('[data-network-tool="c"]').click();
 const blank=await position(page,400,90);
 await page.mouse.click(blank.x,blank.y);
 const draft=field.locator('[data-detached="c"]');
 await expect(draft).toBeVisible();
 await expect(lab).toHaveAttribute("data-model-revision",revision!);
 await page.locator(".network-tray-close").click();
 await draft.locator(".circuit-component-hit").scrollIntoViewIfNeeded();
 await page.waitForFunction(() => {
   const part = document.querySelector('[data-detached="c"] .circuit-component-hit');
   const box = part?.getBoundingClientRect();
   return !!box && !!document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-detached="c"]');
 });
 const start=await middle(draft.locator(".circuit-component-hit"));
 const original=await draft.getAttribute("transform");
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest("[data-component-id]")?.getAttribute("data-component-id"),start)).toBe("draft-1");
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(start.x+125,start.y+35,{steps:8});
 await expect(draft).not.toHaveAttribute("transform",original!);
 await page.mouse.up();
 await expect(draft).not.toHaveAttribute("transform",original!);
 await expect(lab).toHaveAttribute("data-model-revision",revision!);
 const moved=await draft.getAttribute("transform");
 await page.reload();await ready(page);
 await expect(draft).toHaveAttribute("transform",moved!);
 await draft.press("Enter");
 await page.getByRole("button",{name:"Подключить",exact:true}).click();
 await field.getByRole("button",{name:"Шунт к опоре · TL1"}).press("Enter");
 await ready(page);
 await expect(draft).toHaveCount(0);
 await expect(lab).toHaveAttribute("data-method","characteristics-trapezoid");
 const connected=field.locator("[data-contact=C1]");
 await connected.press("Enter");
 await page.getByRole("spinbutton",{name:"C, µF"}).fill("20");
 await ready(page);
 await page.getByRole("button",{name:"Переподключить",exact:true}).click();
 await field.getByRole("button",{name:"Начать перемычку от узла 0"}).press("Enter");
 await field.getByRole("button",{name:"Узел соединения · 1"}).press("Enter");
 await ready(page);
 await connected.press("Enter");
 await expect(page.getByRole("spinbutton",{name:"C, µF"})).toHaveValue("20");
 await expect(page.getByRole("button",{name:"Сменить второй узел"})).toBeVisible();
});


test("reroutes both load leads when the load moves above the line", async ({ page }) => {
  await page.goto(path);
  await ready(page);
  const field = canvas(page);
  const lab = page.locator("[data-network-lab]");
  const revision = await lab.getAttribute("data-model-revision");
  const lead = field.locator("[data-load-lead='0']");
  const previous = await lead.getAttribute("points");
  expect(previous).toBeTruthy();
  const load = field.getByRole("button",{name:"Нагрузка",exact:true}).locator("rect.circuit-component-hit");
  await page.evaluate(() => window.scrollBy({ top: 180, behavior: "instant" }));
  await load.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const part = document.querySelector('[data-component-id="load"] .circuit-component-hit');
    const box = part?.getBoundingClientRect();
    return !!box && !!document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-component-id="load"]');
  });
  const start = await middle(load);
  const destination = await position(page,390,40);
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest("[data-component-id]")?.getAttribute("data-component-id"),start)).toBe("load");
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(destination.x,destination.y,{steps:12});
  await expect(lead).not.toHaveAttribute("points",previous!);
  await page.mouse.up();
  const moved = await lead.getAttribute("points");
  expect(moved).not.toBe(previous);
  await expect(lab).toHaveAttribute("data-model-revision",revision!);
  await ready(page);
  await page.getByRole("button",{name:"Отменить изменение"}).click();
  await expect(lead).toHaveAttribute("points",previous!);
  await page.getByRole("button",{name:"Повторить изменение"}).click();
  await expect(lead).toHaveAttribute("points",moved!);
  await expect(lab).toHaveAttribute("data-model-revision",revision!);
});


test("compound load and bridge movement preserve the exported electrical model",async({page},testInfo)=>{
 const {readFile}=await import("node:fs/promises");
 const original={
  sections:[{id:"TL1",lengthM:1e6,impedanceOhm:50,velocityMS:2e8}],
  source:{voltageV:100,resistanceOhm:0,node:0,onS:0},
  load:{id:"load",kind:"parallel",children:[{id:"R1",kind:"r",value:100},{id:"R2",kind:"r",value:200}]},
  branches:[{id:"R3",from:0,to:1,resistanceOhm:80}],
  durationS:.02,events:[],shunts:[],
 };
 await page.goto(path);await ready(page);
 await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
 await page.locator('input[accept=".json,application/json"]').setInputFiles({name:"circuit.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify({schema:"electrotutor-line-v3",model:original,layout:{}}))});
 const help=page.getByRole("button",{name:"Ещё инструменты и справка"});
 if(await help.locator("..").getAttribute("open")!==null)await help.click();
 const field=canvas(page),lab=page.locator("[data-network-lab]");
 const child=field.locator('[data-wire-endpoint="R2:a"]');
 await expect(child).toHaveCount(1);await ready(page);
 const rev=await lab.getAttribute("data-model-revision");
 async function drag(symbol:ReturnType<Page["locator"]>,dx:number,dy:number){
  await symbol.scrollIntoViewIfNeeded();
  await expect.poll(() => symbol.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-component-id]") ===
      element.closest("[data-component-id]");
  })).toBe(true);
  const p=await middle(symbol);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();
 }
 const before=await child.getAttribute("points");
 const handle=field.locator('[data-component-id="R2"] rect.circuit-component-hit');
 await handle.scrollIntoViewIfNeeded();
 const origin=await middle(handle);
 const sibling=await middle(field.locator('[data-component-id="R1"] rect.circuit-component-hit'));
 await drag(handle,sibling.x-origin.x,sibling.y-origin.y);
 await expect(child).toHaveAttribute("points",before!);
 await drag(handle,24,0);
 await expect(child).not.toHaveAttribute("points",before!);
 const bridge=field.locator('[data-contact="R3"]');
 await drag(bridge.locator("rect.circuit-component-hit"),25,20);
 await expect(field.locator('[data-wire-endpoint="R3:a"]')).toBeVisible();
 const check=async(name:string)=>{
  await expect(lab).toHaveAttribute("data-model-revision",rev!);
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
  await page.getByRole("button",{name:"Сохранить схему"}).click();
  const file=testInfo.outputPath(name+".json");
  await(await download).saveAs(file);
  expect(JSON.parse(await readFile(file,"utf8")).model).toEqual(original);
  await page.getByRole("button",{name:"Ещё инструменты и справка"}).click();
 };
 await check("moved");
 await page.getByRole("button",{name:"Отменить изменение"}).click();
 await check("undo");
 await page.getByRole("button",{name:"Повторить изменение"}).click();
 await check("redo");
});
