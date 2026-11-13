import {dft,orderCoefficients,reconstructionError,type Complex} from "./math";
import {projectBasis,reconstructBasis,type BasisName} from "./bases";

export type Shape="circle"|"square"|"rectangle"|"triangle"|"polygon";
export function contourShape(shape:Shape,sides:number):Complex[]{
 if(shape==="rectangle")return [{re:-1,im:-.58},{re:1,im:-.58},{re:1,im:.58},{re:-1,im:.58}];
 const count=shape==="circle"?160:shape==="square"?4:shape==="triangle"?3:Math.max(3,Math.min(12,Math.round(sides)));
 const offset=shape==="square"?Math.PI/4:Math.PI/2;
 return Array.from({length:count},(_,i)=>{
  const angle=offset+2*Math.PI*i/count;
  return {re:Math.cos(angle),im:Math.sin(angle)};
 });
}
export function smoothContour(points:Complex[],closed:boolean):Complex[]{
 if(points.length<3)return points;
 return points.map((point,i)=>{
  if(!closed&&(i===0||i===points.length-1))return point;
  const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
  return {re:(previous.re+2*point.re+next.re)/4,im:(previous.im+2*point.im+next.im)/4};
 });
}
export function compareBases(samples:Complex[],count:number){
 if(samples.length<2)return [];
 const real=samples.map(p=>p.re),imaginary=samples.map(p=>p.im);
 const fourier=reconstructionError(samples,orderCoefficients(dft(samples),"amplitude").slice(0,count));
 const realBases:Exclude<BasisName,"fourier">[]=["haar","dct","walsh"];
 return [{basis:"fourier" as BasisName,...fourier},...realBases.map(basis=>{
  const a=projectBasis(real,basis),b=projectBasis(imaginary,basis);
  const retained=new Set(a.map((value,index)=>({index,amplitude:Math.hypot(value,b[index])}))
    .sort((x,y)=>y.amplitude-x.amplitude).slice(0,count).map(row=>row.index));
  const re=reconstructBasis(a.map((value,index)=>retained.has(index)?value:0),basis);
  const im=reconstructBasis(b.map((value,index)=>retained.has(index)?value:0),basis);
  const errors=samples.map((p,i)=>Math.hypot(p.re-re[i],p.im-im[i]));
  return {basis,rms:Math.sqrt(errors.reduce((sum,value)=>sum+value**2,0)/errors.length),max:Math.max(...errors)};
 })];
}
