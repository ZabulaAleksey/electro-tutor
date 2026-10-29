import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("PLOT-001..005 Ohm cursor shows an actual analytical sample and labelled SI axes",async({page})=>{
 await page.goto("/ru/#micro=ohm-law");const card=page.locator('[data-micro="ohm-law"]'),plot=card.locator(".engineering-plot");
 await plot.press("End");const cursor=card.locator("[data-cursor-x]");const x=Number(await cursor.getAttribute("data-cursor-x")),y=Number(await cursor.getAttribute("data-cursor-y"));expect(y).toBeCloseTo(x/60,12);
 await expect(card.locator('[data-axis-label="x"]')).toContainText("В");await expect(card.locator('[data-axis-label="y"]')).toContainText("А");await expect(card.locator("[data-plot-readout]")).toContainText("Курсор");
 await card.getByRole("button",{name:"Исследовать →",exact:true}).click();await card.getByRole("button",{name:"Миллиметровая сетка · экранный режим",exact:true}).click();await expect(card.locator("[data-engineering-plot]")).toHaveAttribute("data-grid-mode","millimeter");
});
test("RC time/constant mark and RLC/diode characteristic results remain numerical",async({page})=>{
 await page.goto("/ru/#micro=capacitor-charge");const rc=page.locator('[data-micro="capacitor-charge"]');
 await expect(rc.locator("[data-characteristic-x]")).toHaveAttribute("data-characteristic-x","1");await rc.getByRole("slider",{name:"C, µF",exact:true}).press("End");await expect(rc.locator("[data-characteristic-x]")).toHaveAttribute("data-characteristic-x","2");
 expect(Number(await rc.locator("[data-characteristic-y]").getAttribute("data-characteristic-y"))).toBeCloseTo(12*(1-Math.exp(-1)),11);
 const rlc=page.locator('[data-micro="rlc-resonance"]');expect(Number(await rlc.locator("[data-characteristic-x]").getAttribute("data-characteristic-x"))).toBeCloseTo(1/(2*Math.PI*Math.sqrt(.2*.0001)),10);
 const diode=page.locator('[data-micro="diode-operating-point"]');await diode.locator(".micro-plot").press("Escape");const q=diode.locator("[data-cursor-x]");const ud=Number(await q.getAttribute("data-cursor-x")),id=Number(await q.getAttribute("data-cursor-y"))/1000;expect(5-1000*id-ud).toBeCloseTo(0,11);
});
test("Bode uses shared log frequency, exact cutoff and a clearly separate asymptote",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/ru/#micro=rc-low-pass");const card=page.locator('[data-micro="rc-low-pass"]');await card.getByRole("button",{name:"Исследовать →",exact:true}).click();
 const bode=card.locator(".engineering-bode");await expect(bode.locator('[data-x-scale="log"]')).toHaveCount(2);const plots=bode.locator("[data-engineering-plot]");expect(await plots.nth(0).getAttribute("data-x-domain")).toBe(await plots.nth(1).getAttribute("data-x-domain"));
 const marks=bode.locator("[data-characteristic-y]");expect(Number(await marks.nth(0).getAttribute("data-characteristic-y"))).toBeCloseTo(-10*Math.log10(2),11);expect(Number(await marks.nth(1).getAttribute("data-characteristic-y"))).toBe(-45);await expect(bode.getByText(/0 → −20/)).toBeVisible();
 await card.getByRole("slider",{name:"C, µF",exact:true}).press("End");expect(Number(await marks.nth(0).getAttribute("data-characteristic-x"))).toBeCloseTo(100,10);await expect(page.locator(".katex-error")).toHaveCount(0);expect(errors).toEqual([]);
});
test("three-phase complex plane has isotropic R/X geometry",async({page})=>{
 await page.goto("/ru/interactive/star-neutral/");const phase=page.getByRole("group",{name:"Фаза A — ZA"});await phase.getByRole("spinbutton",{name:"R, Ω",exact:true}).fill("30");await phase.getByRole("spinbutton",{name:"X, Ω",exact:true}).fill("30");
 const c=page.locator(".star-phase-a circle");const dx=Number(await c.getAttribute("cx"))-250,dy=250-Number(await c.getAttribute("cy"));expect(dx).toBeCloseTo(dy,10);
});
test("3D axes/export and 2D section retain the same physical selected state",async({page})=>{
 await page.goto("/ru/#story=line-reflection");const surface=page.locator("[data-line-surface]");await expect(surface.locator('[data-surface-axis="x"]').first()).toBeVisible();for(const axis of ["x","t","U"])expect(await surface.locator(`[data-surface-axis="${axis}"]`).count()).toBeGreaterThan(2);
 const save=page.waitForEvent("download");await surface.getByRole("button",{name:"Экспорт SVG ↓",exact:true}).click();const svg=await readFile((await(await save).path())!,"utf8");expect(svg).toContain("U, В");expect(svg).toContain("t, мс");expect(svg).toContain("export-scale");
 await surface.getByRole("button",{name:"2D-сечение",exact:true}).click();const point=surface.locator(".surface-section [data-cursor-x]");expect(Number(await point.getAttribute("data-cursor-x"))).toBe(75);expect(Number(await point.getAttribute("data-cursor-y"))).toBeCloseTo(200/3,10);
 await surface.getByRole("slider",{name:"Rᴸ, Ω",exact:true}).press("Home");expect(Number(await point.getAttribute("data-cursor-y"))).toBe(0);await expect(surface.locator("[data-surface-u]")).toContainText("0 V");
});
