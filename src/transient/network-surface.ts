import {at,type Quantity,type WaveRun} from "./network";
type XY=readonly[number,number];
function clip(p:XY[],f:(v:XY)=>number,sign:number):XY[]{const out:XY[]=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],fa=f(a)*sign,fb=f(b)*sign;if(fa>=-1e-12)out.push(a);if((fa>1e-12&&fb< -1e-12)||(fa< -1e-12&&fb>1e-12)){const t=fa/(fa-fb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;}
function area(p:XY[]){return Math.abs(p.reduce((s,a,k)=>{const b=p[(k+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;}
type Face={xy:XY[];value:number};
/** Exact front-line subdivision for step waves. Budget refusal uses the existing 2D view. */
export function surfaceFaces(run:WaveRun,q:Quantity):Face[]|null{
 const c=run.config,T=c.durationS,faces:Face[]=[];let base=0;
 for(let j=0;j<c.sections.length;j++){const s=c.sections[j],left=base,right=base+s.lengthM;let cells:XY[][]=[[[left,0],[right,0],[right,T],[left,T]]];
  if(run.method==="exact-fronts"){
   const fronts=[...run.ports[2*j].times.map(time=>(v:XY)=>v[1]-time-(v[0]-left)/s.velocityMS),...run.ports[2*j+1].times.map(time=>(v:XY)=>v[1]-time-(right-v[0])/s.velocityMS)];if(fronts.length>140)return null;
   for(const f of fronts){const next:XY[][]=[];for(const p of cells){const a=clip(p,f,1),b=clip(p,f,-1);if(a.length>=3&&area(a)>s.lengthM*T*1e-12)next.push(a);if(b.length>=3&&area(b)>s.lengthM*T*1e-12)next.push(b);}cells=next;if(cells.length+faces.length>1800)return null;}
  }else {cells=[];for(let x=0;x<24;x++)for(let k=0;k<28;k++)cells.push([[left+s.lengthM*x/24,T*k/28],[left+s.lengthM*(x+1)/24,T*k/28],[left+s.lengthM*(x+1)/24,T*(k+1)/28],[left+s.lengthM*x/24,T*(k+1)/28]]);}
  for(const p of cells){const x=p.reduce((s,v)=>s+v[0],0)/p.length,t=p.reduce((s,v)=>s+v[1],0)/p.length;faces.push({xy:p,value:at(run,x,t)[q]});}base=right;
 }return faces;
}
