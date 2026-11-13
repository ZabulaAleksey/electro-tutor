import { expect, it } from "vitest";
import { DEFAULT_NETWORK, type Network } from "./network";
import { correctInkTarget, readInkDocument, readInkLinks, type InkLink } from "./network-ink";

it("retains original branch terminals and a customized value across recognition changes",()=>{
 const model: Network={...DEFAULT_NETWORK,branches:[{id:"R1",from:0,to:1,resistanceOhm:175}]};
 const link: InkLink={target:{kind:"contact",id:"R1"},kind:"r"};
 expect(correctInkTarget(model,[],link,"r",false)?.model).toBe(model);
 expect(correctInkTarget(model,[],link,"l",false)?.model.branches).toEqual([{id:"R1",from:0,to:1,component:{kind:"l",value:.02}}]);
 expect(correctInkTarget(model,[],link,"line",false)).toBeNull();
});

it("rejects stale, wrong-type or duplicate links without removing the ink",()=>{
 const model: Network={...DEFAULT_NETWORK,branches:[{id:"R1",from:0,to:1,resistanceOhm:175}]};
 const link: InkLink={target:{kind:"contact",id:"R1"},kind:"r"};
 const mark=[[{x:1,y:2}]];
 expect(readInkLinks([link,link,{...link,kind:"c"},{target:{kind:"contact",id:"absent"},kind:"r"}],
  [mark,mark,mark,mark],model,[],false)).toEqual([link,null,null,null]);
});

it("keeps the surviving mark paired to its own branch after rejecting a malformed mark",()=>{
 const model: Network={...DEFAULT_NETWORK,branches:[
  {id:"R1",from:0,to:1,resistanceOhm:175},{id:"R2",from:0,to:1,resistanceOhm:250},
 ]};
 const mark=[[{x:1,y:2}]];
 const links: InkLink[]=[
  {target:{kind:"contact",id:"R1"},kind:"r"},{target:{kind:"contact",id:"R2"},kind:"r"},
 ];
 expect(readInkDocument([[],mark],links,model,[],false)).toEqual({ink:[mark],links:[links[1]]});
});

it("protects a pre-existing resistor in a branch with an added switch",()=>{
 const model: Network={...DEFAULT_NETWORK,branches:[
  {id:"R1",from:1,to:"reference",resistanceOhm:250,switch:{closed:true}},
 ]};
 const link: InkLink={target:{kind:"contact",id:"R1"},kind:"switch"};
 expect(correctInkTarget(model,[],link,"l",false)).toBeNull();
 expect(correctInkTarget(model,[],link,"switch",false)?.model).toBe(model);
});
