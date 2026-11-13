import { describe, expect, it } from "vitest";
import { compoundLoadRoutes } from "./network-load-layout";
import type { Load } from "./network";

const load: Load = { id:"load",kind:"parallel",children:[
  { id:"R1",kind:"r",value:100 },
  { id:"R2",kind:"r",value:200 },
] };

describe("compound load geometry", () => {
  it("preserves both fixed branch anchors after displacement and rotation", () => {
    const original = structuredClone(load);
    const routes=compoundLoadRoutes(load,130,id=>id==="R2"?{x:40,y:-25}:{x:0,y:0},id=>id==="R2"?90:0);
    const [top,bottom]=routes?.get("R2")??[];
    expect(top).toMatch(/^M135 20.*L195 40$/);
    expect(bottom).toMatch(/^M135 110.*L155 40$/);
    expect(routes?.has("R1")).toBe(false);
    expect(load).toEqual(original);
  });

  it("rejects moving a component onto the adjacent branch symbol", () => {
    expect(compoundLoadRoutes(load,130,id=>({x:id==="R2"?-90:0,y:0}),()=>0)).toBeNull();
  });
});
