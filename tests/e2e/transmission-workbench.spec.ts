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
  await expect(page.getByRole("link", { name: "Теория и формулы" })).toHaveAttribute("href", "/ru/topics/");
  await page.getByRole("link", { name: "Переходные процессы в линии", exact: true }).click();
  await ready(page);

  const from = await middle(page.locator('[data-network-tool="line"]'));
  const target = await position(page, 290, 84);
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
  const from = await middle(page.locator('[data-network-tool="line"]'));
  const invalid = await position(page, 143, 84);
  const valid = await position(page, 290, 84);
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
  const add = page.getByRole("button", { name: "Добавить линию", exact: true });
  await add.press("Enter");
  const target = canvas(page).getByRole("button", { name: "Конец линии" });
  await expect(target).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sections(page)).toHaveCount(2);
  await canvas(page).getByRole("button", { name: "TL2 · линия" }).press("Enter");
  await page.locator(".network-tray").getByRole("button", { name: "Удалить", exact: true }).click();
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
    const start = await middle(page.locator('[data-network-tool="shunt"]'));
    const target = await position(page, 143, 84);
    await dispatch("touchStart", [start]);
    await dispatch("touchMove", [{ x: start.x, y: start.y - 26 }]);
    await dispatch("touchMove", [target]);
    await expect(canvas(page).locator('[data-placement="span"][data-snapped=true]')).toHaveAttribute("data-allowed", "true");
    const ghost = await page.locator(".network-drag-ghost").boundingBox();
    expect(ghost!.y + ghost!.height / 2).toBeLessThan(target.y - 20);
    await dispatch("touchEnd", []);
    await expect(sections(page)).toHaveCount(2);
    await ready(page);

    await canvas(page).getByRole("button", { name: "Шунтирующий резистор · 1" }).tap();
    const resistance = page.locator(".network-tray").getByRole("spinbutton", { name: "Сопротивление R, Ω" });
    await resistance.fill("125");
    await expect(page.getByRole("group",{name:"Управление симуляцией"})).toBeVisible();
    await page.locator(".network-tray").getByRole("button", { name: "Переместить" }).tap();
    await canvas(page).getByRole("button", { name: "Узел соединения · 0" }).tap();
    await canvas(page).getByRole("button", { name: "Шунтирующий резистор · 0" }).tap();
    await expect(resistance).toHaveValue("125");
    await page.locator(".network-tray").getByRole("button", { name: "Удалить" }).tap();
    await expect(canvas(page).getByRole("button", { name: "Шунтирующий резистор · 0" })).toHaveCount(0);

    await toolbar.getByRole("button", { name: "Элементы" }).tap();
    await page.locator('[data-network-tool="matched"]').tap();
    await canvas(page).getByRole("button", { name: "Конец линии" }).tap();
    await ready(page);
    const original = await canvas(page).locator(".network-schematic-drawing").getAttribute("transform");
    const origin = await middle(canvas(page));
    await dispatch("touchStart", [{ x: origin.x - 30, y: origin.y, id: 1 }, { x: origin.x + 30, y: origin.y, id: 2 }]);
    await dispatch("touchMove", [{ x: origin.x - 75, y: origin.y, id: 1 }, { x: origin.x + 75, y: origin.y, id: 2 }]);
    await dispatch("touchEnd", []);
    await expect(canvas(page).locator(".network-schematic-drawing")).not.toHaveAttribute("transform", original!);
    await page.getByRole("button", { name: "Показать всю схему" }).tap();
    await expect(canvas(page).locator(".network-schematic-drawing")).toHaveAttribute("transform", original!);
    await expect(sections(page)).toHaveCount(2);
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
 await bar.getByRole("button",{name:/Старт$/}).click();
 await expect.poll(async()=>Number(await lab.getAttribute("data-current-time"))).toBeGreaterThan(.001);
 await bar.getByRole("button",{name:/Пауза$/}).click();
 const paused=await lab.getAttribute("data-current-time");
 await speed.selectOption("0.5");
 await expect(lab).toHaveAttribute("data-current-time",paused!);
 await bar.getByRole("button",{name:/Старт$/}).click();
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


test("selects both bridge ends, switches the branch and restores its v3 JSON",async({page})=>{
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
 const json=JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!,"utf8"));
 expect(json.schema).toBe("electrotutor-line-v3");
 expect(json.model.branches).toEqual([{id:"R1",from:0,to:1,resistanceOhm:80,switch:{closed:true}}]);
 await page.locator('input[type="file"]').setInputFiles({name:"legacy.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify({schema:"electrotutor-line-v2",model:{...json.model,branches:undefined},layout:{}}))});
 await ready(page);
 await expect(key).toHaveCount(0);
 await page.locator('input[type="file"]').setInputFiles((await file.path())!);
 await ready(page);
 await expect(key).toHaveAttribute("data-closed","true");
});
