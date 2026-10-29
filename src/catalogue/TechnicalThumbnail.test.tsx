import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {expect,it} from "vitest";
import ToolCard,{ToolArt} from "../components/ToolCard";
type XY=[number,number];
const point=(s:string)=>s.split(",").map(Number) as XY;
function wires(svg:string):[XY,XY][] {
 const result:[XY,XY][]=[];
 const bare=svg.replace(/<g data-symbol="[\s\S]*?<\/g>/g,"");
 for(const tag of bare.match(/<path\b[^>]*>/g)??[]){if(/stroke="/.test(tag))continue;const d=/\bd="([^"]*)"/.exec(tag)?.[1]??"",tokens=d.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g)??[];let i=0,op="",from:XY=[0,0];while(i<tokens.length){if(/[A-Za-z]/.test(tokens[i]))op=tokens[i++];if(!["M","L","H","V"].includes(op))throw Error(`Unexpected wire command ${op}`);const n=Number(tokens[i++]);const to:XY=op==="H"?[n,from[1]]:op==="V"?[from[0],n]:[n,Number(tokens[i++])];if(op!=="M")result.push([from,to]);else op="L";from=to;}}
 return result;
}
const on=(p:XY,a:XY,b:XY)=>Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7;
for(const kind of ["ohm","mesh","nodes","thevenin","rc","rlc"] as const)it(`${kind} thumbnail has connected element terminals without wire bypass`,()=>{
 const svg=renderToStaticMarkup(createElement(ToolArt,{kind})),edges=wires(svg),terminals=[...svg.matchAll(/data-terminals="([^"]+)"/g)].map(m=>m[1].split(";").map(point));expect(terminals.length).toBeGreaterThan(1);
 const vertices=[...edges.flat(),...terminals.flat()],parent=vertices.map((_,i)=>i);const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
 for(const [a,b]of edges){const ids=vertices.map((p,i)=>on(p,a,b)?i:-1).filter(i=>i>=0);for(const i of ids)parent[root(i)]=root(ids[0]);}
 for(const [a,b]of terminals){expect(edges.some(([c,d])=>on(a,c,d))).toBe(true);expect(edges.some(([c,d])=>on(b,c,d))).toBe(true);const ai=vertices.findIndex(p=>p===a),bi=vertices.findIndex(p=>p===b);expect(root(ai)).not.toBe(root(bi));}
});
it("three phase illustration samples a balanced system and the whole card is one real link",()=>{const svg=renderToStaticMarkup(createElement(ToolArt,{kind:"three-phase"}));const curves=[...svg.matchAll(/<polyline points="([^"]+)"/g)].map(m=>m[1].split(" ").map(point));expect(curves).toHaveLength(3);for(let i=0;i<73;i++)expect(curves.reduce((s,c)=>s+c[i][1],0)).toBeCloseTo(3*67,10);const card=renderToStaticMarkup(createElement(ToolCard,{title:"RC",category:"TOE",href:"/ru/micro-labs/#micro=capacitor-charge",action:"Открыть"}));expect(card.match(/<a /g)).toHaveLength(1);expect(card).not.toMatch(/<button|<input/);});
