import { readFile } from "node:fs/promises";
import {expect,test} from "@playwright/test";
const url="/ru/interactive/transmission-line/";
const scheme=(page:import("@playwright/test").Page)=>page.locator("[data-network-canvas]");
const openTiming=async(page:import("@playwright/test").Page)=>{
 const timing=page.locator(".network-timing");
 if(await timing.getAttribute("open")===null)await timing.locator("summary").click();
};
const source=async(page:import("@playwright/test").Page)=>scheme(page).getByRole("button",{name:"Источник",exact:true}).press("Enter");
const load=async(page:import("@playwright/test").Page)=>scheme(page).getByRole("button",{name:"Нагрузка",exact:true}).press("Enter");
const addLine=async(page:import("@playwright/test").Page)=>{
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.getByRole("button",{name:"Линия передачи",exact:true}).click();
 await scheme(page).getByRole("button",{name:"Конец линии",exact:true}).press("Enter");
};
const ready=async(page:import("@playwright/test").Page)=>expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
test("primary line constructor automatically calculates sharp fronts and locks physical scales",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(url);await ready(page);const lab=page.locator("[data-network-lab]");
 await expect(page.getByRole("button",{name:"Применить параметры",exact:true})).toHaveCount(0);await expect(page.getByLabel("Число Куранта",{exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Согласованная",exact:true})).toHaveCount(0);
 await source(page);await page.getByRole("spinbutton",{name:"Rₛ, Ω",exact:true}).fill("50");await load(page);await page.locator(".network-inspector").getByRole("button",{name:"+ R",exact:true}).click();await ready(page);
 await page.getByRole("slider",{name:"Точка наблюдения x",exact:true}).press("End");await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("6");await expect(lab).toHaveAttribute("data-probe-u","50");await expect(lab).toHaveAttribute("data-probe-i","1");
 const domains=await lab.locator(".network-plot-grid [data-y-domain]").evaluateAll(es=>es.map(e=>e.getAttribute("data-y-domain")));await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("15");expect(await lab.locator(".network-plot-grid [data-y-domain]").evaluateAll(es=>es.map(e=>e.getAttribute("data-y-domain")))).toEqual(domains);
 const traces=await lab.locator(".network-plot-grid [data-plot-curve]").first().getAttribute("points");expect(traces).toBeTruthy();expect(errors).toEqual([]);
});
test("live resistor event preserves the past and the locked axes",async({page},testInfo)=>{
 await page.goto(url);await ready(page);const lab=page.locator("[data-network-lab]");await source(page);await page.getByRole("spinbutton",{name:"Rₛ, Ω",exact:true}).fill("50");await load(page);await page.locator(".network-inspector").getByRole("button",{name:"+ R",exact:true}).click();await ready(page);await page.locator(".network-tray-close").click();await page.getByRole("slider",{name:"Точка наблюдения x",exact:true}).press("End");await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("8");await page.locator(".network-timing summary").click();await load(page);await page.locator(".network-inspector").getByText("Изменение во время опыта",{exact:true}).click();await page.getByRole("combobox",{name:"Изменение параметров",exact:true}).selectOption("live");const domain=await lab.locator(".network-plot-grid [data-y-domain]").first().getAttribute("data-y-domain");await page.getByRole("spinbutton",{name:"load · R, Ω",exact:true}).fill("100");await ready(page);await expect.poll(async()=>Number(await lab.getAttribute("data-probe-u"))).toBeCloseTo(200/3,8);expect(await lab.locator(".network-plot-grid [data-y-domain]").first().getAttribute("data-y-domain")).toBe(domain);await page.locator(".network-tray-close").click();await openTiming(page);
 const time=page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true});
 await time.fill("7.999");
 await expect(lab).toHaveAttribute("data-probe-u","50");
 await time.fill("8");
 await expect.poll(async()=>Number(await lab.getAttribute("data-probe-u"))).toBeCloseTo(200/3,8);
 await page.locator(".network-timing summary").click();
 await page.getByText("Экспорт результатов",{exact:true}).click();
 const download=page.waitForEvent("download");
 await page.getByRole("button",{name:"JSON",exact:true}).click();
 const file=testInfo.outputPath("resistance-event.json");
 await (await download).saveAs(file);
 const result=JSON.parse(await readFile(file,"utf8"));
 expect(result.circuit.model.events).toEqual([expect.objectContaining({atS:.008,target:"load",kind:"resistance",previous:50,value:100})]);
 const atEvent=result.measurements.filter(([time]:number[])=>time===.008);
 expect(atEvent).toHaveLength(2);
 expect(atEvent[0][1]).toBeCloseTo(50,8);
 expect(atEvent[1][1]).toBeCloseTo(200/3,8);
});
test("three heterogeneous sections retain physical distance, voltage and SVG export",async({page},testInfo)=>{
 await page.goto(url);await ready(page);await source(page);await page.getByRole("spinbutton",{name:"Rₛ, Ω",exact:true}).fill("50");await addLine(page);await addLine(page);await scheme(page).getByRole("button",{name:"TL2 · линия"}).press("Enter");await page.getByRole("spinbutton",{name:"TL2 · Z₀, Ω",exact:true}).fill("100");await scheme(page).getByRole("button",{name:"TL3 · линия"}).press("Enter");await page.getByRole("spinbutton",{name:"TL3 · Z₀, Ω",exact:true}).fill("25");await load(page);await page.locator(".network-inspector").getByRole("button",{name:"+ R",exact:true}).click();await page.getByRole("spinbutton",{name:"load · R, Ω",exact:true}).fill("25");await ready(page);
 const lab=page.locator("[data-network-lab]");await expect(lab.locator("[data-line-section]")).toHaveCount(3);await page.getByRole("slider",{name:"Точка наблюдения x",exact:true}).press("End");await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("16");await expect.poll(async()=>Number(await lab.getAttribute("data-probe-u"))).toBeCloseTo(80/3,8);const plot=lab.getByRole("img",{name:"U(x)",exact:true});
 await expect(plot.locator("[data-cursor-x]")).toHaveAttribute("data-cursor-x","3000000");
 expect(Number(await plot.locator("[data-cursor-y]").getAttribute("data-cursor-y"))).toBeCloseTo(80/3,8);
 await page.locator(".network-timing summary").click();
 await page.getByText("Экспорт результатов",{exact:true}).click();
 const download=page.waitForEvent("download");
 await page.getByRole("button",{name:"SVG · U(x)",exact:true}).click();
 const file=testInfo.outputPath("voltage.svg");
 const svg=await download;
 expect(svg.suggestedFilename()).toBe("electrotutor-line-voltage.svg");
 await svg.saveAs(file);
 const markup=await readFile(file,"utf8");
 expect(markup).toContain('data-plot-curve="U(x)"');
 expect(markup).toContain('data-cursor-x="3000000"');
 expect(Number(/data-cursor-y="([^"]+)"/.exec(markup)?.[1])).toBeCloseTo(80/3,8);
});
test("capacitor constructor uses dynamic device state instead of constant reflection",async({page})=>{
 await page.goto(url);await ready(page);await source(page);await page.getByRole("spinbutton",{name:"Rₛ, Ω",exact:true}).fill("50");await load(page);await page.locator(".network-inspector").getByRole("button",{name:"+ C",exact:true}).click();await ready(page);const lab=page.locator("[data-network-lab]");await expect(lab).toHaveAttribute("data-method","characteristics-trapezoid");await page.getByRole("slider",{name:"Точка наблюдения x",exact:true}).press("End");await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("6");await expect.poll(async()=>Math.abs(Number(await lab.getAttribute("data-probe-u"))-100*(1-Math.exp(-2)))).toBeLessThan(.7);await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("8");expect(Number(await lab.getAttribute("data-probe-u"))).toBeGreaterThan(99);
});
test("playback speed and OS appearance preserve physical state; mobile fits",async({page})=>{
 await page.goto(url);await ready(page);const lab=page.locator("[data-network-lab]");await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("6");const rev=await lab.getAttribute("data-model-revision"),domains=await lab.locator(".network-plot-grid [data-y-domain]").evaluateAll(es=>es.map(e=>e.getAttribute("data-y-domain")));await page.getByRole("button",{name:/Пуск$/}).click();await expect.poll(async()=>Number(await lab.getAttribute("data-current-time"))).toBeGreaterThan(.006);const before=Number(await lab.getAttribute("data-current-time"));await page.getByRole("combobox",{name:"Скорость",exact:true}).selectOption("8");expect(Number(await lab.getAttribute("data-current-time"))).toBeGreaterThanOrEqual(before);await page.getByRole("button",{name:/Пауза$/}).click();const paused=await lab.getAttribute("data-current-time");const plot=lab.locator(".engineering-plot").first();const plotColor=await plot.evaluate(e=>getComputedStyle(e).backgroundColor);await page.emulateMedia({colorScheme:"dark"});await expect(page.locator("html")).toHaveAttribute("data-theme","light");await expect(plot).toHaveCSS("background-color",plotColor);expect(await lab.getAttribute("data-current-time")).toBe(paused);expect(await lab.getAttribute("data-model-revision")).toBe(rev);expect(await lab.locator(".network-plot-grid [data-y-domain]").evaluateAll(es=>es.map(e=>e.getAttribute("data-y-domain")))).toEqual(domains);await expect(lab).toHaveAttribute("data-current-speed","8");await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);expect(await plot.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe("rgb(255, 255, 255)");
});

test("visited primary characteristic Worker remains usable offline",async({page,context})=>{
 await page.goto(url);await ready(page);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await ready(page);await context.setOffline(true);await page.reload({waitUntil:"domcontentloaded"});await ready(page);await source(page);await page.getByRole("spinbutton",{name:"E, V",exact:true}).fill("120");await ready(page);await openTiming(page);await page.getByRole("spinbutton",{name:"Физическое время t, ms",exact:true}).fill("4");expect(Number(await page.locator("[data-network-lab]").getAttribute("data-probe-u"))).toBeGreaterThan(0);await context.setOffline(false);
});
