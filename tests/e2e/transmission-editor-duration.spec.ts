import {expect,test,type Page} from "@playwright/test";

const path="/ru/interactive/transmission-line/";
const canvas=(page:Page)=>page.locator("[data-network-canvas]");
const ready=(page:Page)=>expect(page.locator("[data-network-lab]")).toHaveAttribute("data-calculation-ready","true");
async function tool(page:Page,kind:string){
 await page.getByRole("button",{name:"Элементы",exact:true}).click();
 await page.locator(`[data-network-tool=${kind}]`).click();
}
test("clear requires confirmation, restores with undo and starts a new circuit",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page),clear=page.getByRole("button",{name:"Очистить схему"});
 await clear.click();
 await expect(page.getByRole("dialog")).toContainText("Очистить всю схему? Все размещённые элементы и соединения будут удалены.");
 await page.getByRole("button",{name:"Отмена",exact:true}).click();
 await expect(field.locator("[data-line-section]")).toHaveCount(1);
 await clear.click();await page.getByRole("button",{name:"Очистить",exact:true}).click();
 await expect(field.locator("[data-line-section]")).toHaveCount(0);
 await expect(clear).toBeDisabled();
 await page.getByRole("button",{name:"Отменить изменение"}).click();await ready(page);
 await expect(field.locator("[data-line-section]")).toHaveCount(1);
 await page.getByRole("button",{name:"Повторить изменение"}).click();
 await page.reload();
 await expect(clear).toBeDisabled();
 await tool(page,"line");
 await field.getByRole('button',{name:'Конец линии',exact:true}).press('Enter');
 await ready(page);
});
test("mounts two series contacts, inserts into an ideal bridge and rotates without recalculation",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page),lab=page.locator("[data-network-lab]");
 await tool(page,"r");
 await field.getByRole("button",{name:"В разрыв линии · TL1"}).press("Enter");
 await tool(page,"l");
 await field.getByRole("button",{name:"В разрыв линии · TL2"}).press("Enter");
 await expect(field.locator("[data-contact]")).toHaveCount(2);
 await ready(page);
 const contact=field.locator("[data-contact=L1]");
 await contact.press("Enter");
 const before=await lab.getAttribute("data-model-revision");
 await page.getByRole("button",{name:"Повернуть",exact:true}).click();
 await expect(contact.locator("g[transform]").first()).toHaveAttribute("transform",/rotate\(90\)/);
 await expect(lab).toHaveAttribute("data-model-revision",before!);
 await page.getByRole("button",{name:"Отменить изменение"}).click();
 await expect(contact.locator("g[transform]").first()).toHaveAttribute("transform",/rotate\(0\)/);
 await page.getByRole("button",{name:"Повторить изменение"}).click();
 await expect(contact.locator("g[transform]").first()).toHaveAttribute("transform",/rotate\(90\)/);
 await field.getByRole("button",{name:"Начать перемычку от узла 0"}).press("Enter");
 await expect(field.locator(".network-first-terminal")).toHaveCount(1);
 await field.getByRole("button",{name:"Узел соединения · 1"}).press("Enter");
 await expect(field.locator("[data-contact=W1]")).toHaveCount(1);
 await tool(page,"r");
 await field.getByRole("button",{name:/В разрыв провода/}).press("Enter");
 await expect(field.locator("[data-contact=W1]")).toHaveCount(0);
 await expect(field.locator("[data-contact=R2]")).toHaveCount(1);
 await ready(page);
});
test("preserves a resistor nominal after copying and attaching the copy",async({page})=>{
 await page.goto(path);await ready(page);
 const field=canvas(page);
 await tool(page,"r");
 await field.getByRole("button",{name:"Шунт к опоре · TL1"}).press("Enter");
 const resistor=field.locator("[data-contact=R1]");
 await resistor.press("Enter");
 await page.getByLabel("Сопротивление R, Ω").fill("150");
 await resistor.press("Control+c");await resistor.press("Control+v");
 const draft=field.locator("[data-detached=r]");
 await expect(draft).toHaveCount(1);
 await page.getByRole("button",{name:"Подключить",exact:true}).click();
 await field.getByRole("button",{name:"Шунт к опоре · 2"}).press("Enter");
 const copy=field.locator("[data-contact=R2]");
 await copy.press("Enter");
 await expect(page.getByLabel("Сопротивление R, Ω")).toHaveValue("150");
 await ready(page);
});
test("calculates one second and zooms stored time data",async({page})=>{
 await page.goto(path);await ready(page);
 const lab=page.locator("[data-network-lab]");
 await page.locator(".network-timing summary").click();
 await page.getByRole("button",{name:"1 s",exact:true}).click();
 await ready(page);
 const rev=await lab.getAttribute("data-model-revision");
 await page.getByLabel("Физическое время t, ms").fill("6");
 await page.getByLabel("Окно времени").selectOption("50");
 await expect(lab).toHaveAttribute("data-model-revision",rev!);
 await expect(page.getByLabel("Центр окна")).toHaveAttribute("max","1");
 await expect(page.getByRole("img",{name:"U(t)",exact:true})).toBeVisible();
});
test("terminates a running worker and retries",async({page})=>{
 await page.addInitScript(()=>{
  const BrowserWorker=window.Worker;
  let delayNext=false;
  window.addEventListener("slow-next-network-run",()=>{delayNext=true;});
  window.Worker=class extends BrowserWorker{
   private timeout:number|undefined;
   postMessage(message:unknown){
    if(!delayNext){super.postMessage(message);return;}
    delayNext=false;
    this.timeout=window.setTimeout(()=>super.postMessage(message),2500);
   }
   terminate(){clearTimeout(this.timeout);super.terminate();}
  };
 });
 await page.goto(path);await ready(page);
 await page.locator(".network-timing summary").click();
 await page.evaluate(()=>window.dispatchEvent(new Event("slow-next-network-run")));
 await page.getByRole("button",{name:"1 s",exact:true}).click();
 await expect(page.getByLabel("Прогресс расчёта")).toBeVisible();
 await page.getByRole("button",{name:"Отменить расчёт",exact:true}).click();
 await expect(page.getByRole("button",{name:"Повторить расчёт"})).toBeVisible();
 await page.getByRole("button",{name:"Повторить расчёт"}).click();
 await ready(page);
});


test("spatial voltage and current share the wave colors",async({page})=>{
 await page.goto(path);await ready(page);
 const waves=page.getByRole("checkbox",{name:"Прямая / обратная / сумма"});
 await waves.check();
 for(const quantity of ["U","I"]){
  await expect(page.locator(`[data-plot-curve="${quantity}(x)"]`)).toHaveAttribute("stroke","var(--blue)");
  await expect(page.locator(`[data-plot-curve="Прямая ${quantity}⁺"]`)).toHaveAttribute("stroke","var(--red)");
  await expect(page.locator(`[data-plot-curve="Обратная ${quantity}⁻"]`)).toHaveAttribute("stroke","var(--green)");
 }
});
