import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("reference grid reflows, expands a real experiment, and retains computed state", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce",colorScheme:"light"});
  for(const [width,cols] of [[1600,4],[1300,3],[900,2],[390,1]]) {
    await page.setViewportSize({width,height:900}); await page.goto("/ru/#micro=ohm-law");
    await expect(page.locator("[data-micro]")).toHaveCount(14);
    expect(await page.locator(".micro-grid").evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(" ").length)).toBe(cols);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  const card=page.locator('[data-micro="ohm-law"]');
  await card.getByRole("slider",{name:"U, V",exact:true}).press("End");
  await card.getByRole("button",{name:"Исследовать →",exact:true}).click();
  await expect(card).toHaveAttribute("data-expanded","true");
  await expect(card.locator('[data-micro-result="I"]')).toContainText("0,8");
  await expect(card.getByRole("link",{name:"Учебный материал ↗",exact:true})).toHaveAttribute("href","/ru/topics/dc/mesh-current-method/");
  await card.getByRole("button",{name:"Свернуть ↑",exact:true}).click();
  await expect(card).toHaveAttribute("data-expanded","false");
});

test("lossless surface, schematic and time section share boundary and parameter state", async ({page}) => {
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/ru/#story=line-reflection"); const surface=page.locator("[data-line-surface]");
  await expect(surface.locator("[data-surface-u]")).toContainText("66,667 V");
  await surface.getByRole("slider",{name:"Rᴸ, Ω",exact:true}).press("Home");
  await expect(surface.locator("[data-surface-u]")).toContainText("0 V");
  await expect(surface.locator(".surface-reading")).toContainText("2 A");
  await expect(surface.locator(".surface-circuit")).toContainText("Rᴸ = 0 Ω");
  await surface.getByRole("slider",{name:"t, ms",exact:true}).press("Home");
  await expect(surface.locator(".surface-reading")).toContainText("0 A");
  const before=await surface.locator("polygon").first().getAttribute("points");
  await surface.getByRole("slider",{name:"Поворот поверхности",exact:true}).press("End");
  expect(await surface.locator("polygon").first().getAttribute("points")).not.toBe(before);
  await surface.getByRole("button",{name:"2D-сечение",exact:true}).click();
  await expect(surface.getByRole("img",{name:"Пространственное сечение напряжения",exact:true})).toBeVisible();
  await surface.getByRole("button",{name:"3D",exact:true}).click();
  await expect(surface.getByRole("img",{name:"Поверхность напряжения U(x,t), перетащите для поворота",exact:true})).toBeVisible();
  await page.reload(); await expect(surface.locator("[data-surface-u]")).toContainText("66,667 V");
  expect(errors).toEqual([]);
});

test("local board draws, erases, undoes clear/erase, and exports actual SVG", async ({page}) => {
  const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/ru/#engineering-board"); const board=page.locator("#engineering-board"), canvas=board.locator(".board-canvas");
  await canvas.scrollIntoViewIfNeeded(); const b=(await canvas.boundingBox())!;
  await page.mouse.move(b.x+b.width*.45,b.y+b.height*.45); await page.mouse.down();
  await page.mouse.move(b.x+b.width*.6,b.y+b.height*.6,{steps:8}); await page.mouse.up();
  await expect(board.locator("[data-board-stroke]")).toHaveCount(1);
  await board.getByRole("button",{name:"Очистить",exact:true}).click(); await expect(board.locator("[data-board-stroke]")).toHaveCount(0);
  await board.getByRole("button",{name:"↶ Отменить",exact:true}).click(); await expect(board.locator("[data-board-stroke]")).toHaveCount(1);
  await board.getByRole("button",{name:"Ластик",exact:true}).click();
  const stroke=board.locator("[data-board-stroke]"); const sb=(await stroke.boundingBox())!;
  await page.mouse.click(sb.x+sb.width/2,sb.y+sb.height/2); await expect(stroke).toHaveCount(0);
  await board.getByRole("button",{name:"↶ Отменить",exact:true}).click(); await expect(stroke).toHaveCount(1);
  const download=page.waitForEvent("download"); await board.getByRole("button",{name:"Сохранить SVG ↓",exact:true}).click();
  const saved=await download, text=await readFile((await saved.path())!,"utf8");
  expect(saved.suggestedFilename()).toBe("electrotutor-board.svg"); expect(text).toContain("data-board-stroke"); expect(text).toContain("viewBox=\"0 0 1000 420\""); expect(text).not.toContain("<script"); expect(errors).toEqual([]);
});
