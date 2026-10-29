import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CircuitView } from "../showcase/MicroVisual";
import { microLabs } from "../showcase/micro-catalog";
import { microModel } from "../showcase/micro-models";
type XY=readonly[number,number];
type Segment={a:XY;b:XY};
const attr=(text:string,name:string)=>Number(new RegExp(`\\b${name}="([^"]+)"`).exec(text)?.[1]);
/** Independent connectivity reconstruction of the actual neutral SVG strokes and symbol pins.
 * This narrow parser intentionally supports only the three published series examples. */
function connections(svg:string) {
  const wires:Segment[]=[],components:Segment[]=[];
  const drawing=svg.slice(svg.indexOf("</defs>")+7);
  for(const match of drawing.matchAll(/<path\b([^>]*)>/g)){
    if(/marker-end=/.test(match[1]))continue;
    const d=/\bd="([^"]+)"/.exec(match[1])?.[1];if(!d)continue;
    const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g)??[];
    let i=0,command="",point:XY=[0,0],coil:Segment|undefined;
    while(i<tokens.length){if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];const relative=command===command.toLowerCase(),op=command.toUpperCase(),count=op==="M"||op==="L"?2:op==="H"||op==="V"?1:op==="A"?7:0;if(!count)throw new Error(`Unverified SVG command ${command}`);
      const n=tokens.slice(i,i+count).map(Number);i+=count;let next:XY=point;
      if(op==="M"||op==="L")next=[n[0]+(relative?point[0]:0),n[1]+(relative?point[1]:0)];
      if(op==="H")next=[n[0]+(relative?point[0]:0),point[1]];
      if(op==="V")next=[point[0],n[0]+(relative?point[1]:0)];
      if(op==="A"){next=[n[5]+(relative?point[0]:0),n[6]+(relative?point[1]:0)];coil=coil?{a:coil.a,b:next}:{a:point,b:next};}
      else if(op!=="M")wires.push({a:point,b:next});point=next;
    }
    if(coil)components.push(coil);
  }
  for(const m of drawing.matchAll(/<rect\b([^>]*)>/g)){const x=attr(m[1],"x"),y=attr(m[1],"y"),w=attr(m[1],"width"),h=attr(m[1],"height");components.push({a:[x,y+h/2],b:[x+w,y+h/2]});}
  for(const m of drawing.matchAll(/<circle\b([^>]*)>/g)){const r=attr(m[1],"r");if(r>10){const x=attr(m[1],"cx"),y=attr(m[1],"cy");components.push({a:[x,y-r],b:[x,y+r]});}}
  // The two equal parallel plates form a capacitor, never a wire across its gap.
  for(let a=0;a<wires.length;a++)for(let b=a+1;b<wires.length;b++){
    const p=wires[a],q=wires[b],horizontal=p.a[1]===p.b[1]&&q.a[1]===q.b[1]&&p.a[0]===q.a[0]&&p.b[0]===q.b[0]&&p.a[1]!==q.a[1];
    const vertical=p.a[0]===p.b[0]&&q.a[0]===q.b[0]&&p.a[1]===q.a[1]&&p.b[1]===q.b[1]&&p.a[0]!==q.a[0];
    if(horizontal&&Math.abs(p.a[1]-q.a[1])<=25&&Math.abs(p.b[0]-p.a[0])<=40)components.push({a:[(p.a[0]+p.b[0])/2,p.a[1]],b:[(q.a[0]+q.b[0])/2,q.a[1]]});
    if(vertical&&Math.abs(p.a[0]-q.a[0])<=15&&Math.abs(p.b[1]-p.a[1])<=30)components.push({a:[p.a[0],(p.a[1]+p.b[1])/2],b:[q.a[0],(q.a[1]+q.b[1])/2]});
  }
  const points=[...wires,...components].flatMap(s=>[s.a,s.b]),parents=points.map((_,k)=>k);
  const root=(k:number):number=>parents[k]===k?k:parents[k]=root(parents[k]);
  const merge=(a:number,b:number)=>{parents[root(a)]=root(b);};
  const on=(p:XY,s:Segment)=>Math.abs((s.b[0]-s.a[0])*(p[1]-s.a[1])-(s.b[1]-s.a[1])*(p[0]-s.a[0]))<1e-9&&p[0]>=Math.min(s.a[0],s.b[0])&&p[0]<=Math.max(s.a[0],s.b[0])&&p[1]>=Math.min(s.a[1],s.b[1])&&p[1]<=Math.max(s.a[1],s.b[1]);
  points.forEach((p,i)=>points.forEach((q,j)=>{if(p[0]===q[0]&&p[1]===q[1])merge(i,j);}));
  for(const wire of wires){const ids=points.flatMap((p,k)=>on(p,wire)?[k]:[]);ids.forEach(k=>merge(k,ids[0]));}
  const port=(p:XY)=>root(points.findIndex(q=>q[0]===p[0]&&q[1]===p[1]));
  return components.map(c=>[port(c.a),port(c.b)]);
}
for(const [id,expected] of [["ohm-law",2],["rlc-resonance",4],["capacitor-charge",3]] as const)it(`CIRCUIT-001..003 / ${id}: actual rendered ports form one correctly polarised series loop`,()=>{
  const lab=microLabs.find(l=>l.id===id)!,a=lab.parameters[0].initial,b=lab.parameters[1].initial;
  const svg=renderToStaticMarkup(createElement(CircuitView,{lab,a,b,language:"ru"})),edges=connections(svg),degree=new Map<number,number>();
  expect(edges).toHaveLength(expected);for(const [u,v] of edges){expect(u).not.toBe(v);degree.set(u,(degree.get(u)??0)+1);degree.set(v,(degree.get(v)??0)+1);}
  expect([...degree.values()]).toEqual(Array(expected).fill(2));
  expect(svg).toContain('M145 73 H207');if(id==="rlc-resonance"){expect(svg).toContain('>∿</text>');expect(svg).toContain('230 V RMS');}else{expect(svg).toContain('>+</text>');expect(svg).toContain('>−</text>');}
  const model=microModel(lab.model,a,b,0);if(id==="ohm-law")expect(model.metrics[0].value).toBeCloseTo(a/b,12);if(id==="capacitor-charge")expect(model.point[1]).toBe(0);
});
