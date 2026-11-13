import type { Load } from "./network";
import { routeSymbolLeads, symbolBounds } from "./network-routing";

type Size={w:number;h:number};
export function size(l:Load):Size{if(!l.children?.length)return{w:90,h:90};const sizes=l.children.map(size);if(l.kind==="switch")return{w:sizes[0].w+30,h:sizes[0].h+70};if(l.kind==="parallel")return{w:sizes.reduce((s,x)=>s+x.w,0)+20,h:Math.max(...sizes.map(s=>s.h))+40};return{w:Math.max(...sizes.map(s=>s.w))+20,h:sizes.reduce((s,x)=>s+x.h,0)+20};}
export function compoundLoadRoutes(load:Load, height:number, displacement:(id:string)=>{x:number;y:number}, rotation:(id:string)=>number){
 const scale=height/size(load).h;
 const routes=new Map<string,string[]>();
 const leaves:{id:string;nodes:[{x:number;y:number},{x:number;y:number}];center:{x:number;y:number};angle:number;pins:[number,number];changed:boolean}[]=[];
 function walk(part:Load,x:number,y:number):boolean{
  const dimensions=size(part), anchor=x+dimensions.w/2;
  const children=part.children??[];
  if(part.kind==="parallel"&&children.length){
   let next=x;
   return children.every(child=>{const left=next;next+=size(child).w;return walk(child,left,y+20);});
  }
  if(children.length&&part.kind!=="switch"){
   let top=y+10;
   return children.every(child=>{const d=size(child), start=top;top+=d.h;return walk(child,anchor-d.w/2,start);});
  }
  const shift=displacement(part.id),angle=rotation(part.id);
  const switching=children.length>0&&part.kind==="switch";
  const bottom=switching?50:dimensions.h,center=switching?30:45;
  leaves.push({id:part.id,nodes:[{x:anchor,y},{x:anchor,y:y+bottom}],
   center:{x:anchor+shift.x/scale,y:y+center+shift.y/scale},angle:90+angle,
   pins:switching?[-10,10]:[-20,20],changed:!!(shift.x||shift.y||angle)});
  return !children.length||walk(children[0],anchor-size(children[0]).w/2,y+50);
 }
 walk(load,0,0);
 for(const leaf of leaves){
  if(!leaf.changed)continue;
  const obstacles=leaves.filter(other=>other!==leaf).map(other=>symbolBounds(other.center,other.angle,other.pins,18));
  const route=routeSymbolLeads(leaf.nodes,leaf.center,leaf.angle,leaf.pins,18,obstacles);
  if(!route)return null;
  routes.set(leaf.id,route);
 }
 return routes;
}
