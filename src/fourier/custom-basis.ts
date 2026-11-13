import type {Complex} from "./math";

const term=/^([+-]?)(?:(\d+(?:\.\d+)?|\.\d+)\*)?(1|x(?:\^[0-6])?|(?:sin|cos)\((?:\d+(?:\.\d+)?|\.\d+)\*x\)|step\((?:\d+(?:\.\d+)?|\.\d+)\))$/;
export function parseBasis(text:string){
 const rows=text.trim().split("\n").map(row=>row.replace(/\s/g,""));
 if(rows.length>8||text.length>1000)return null;
 const basis=rows.map(row=>{
  const parts=row.match(/[+-]?[^+-]+/g)??[];
  if(!parts.length||parts.join("")!==row||parts.length>8)return null;
  const functions=parts.map(part=>{
   const constant=/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(part)?Number(part):null;
   if(constant!==null)return Math.abs(constant)<=1000?()=>constant:null;
   const match=part.match(term);
   if(!match)return null;
   const [,sign,multiplier,expr]=match;
   const amplitude=(sign==="-"?-1:1)*Number(multiplier??1);
   const parameter=Number(expr.match(/\(([^*)]+)/)?.[1]??0);
   if(Math.abs(amplitude)>1000||parameter>1000)return null;
   return (x:number)=>amplitude*(expr==="1"?1:expr.startsWith("x")?x**Number(expr.split("^")[1]??1):
     expr.startsWith("sin")?Math.sin(parameter*x):expr.startsWith("cos")?Math.cos(parameter*x):Number(x>=parameter));
  });
  return functions.every(f=>f!==null)?(x:number)=>functions.reduce((sum,f)=>sum+f!(x),0):null;
 });
 return basis.every(f=>f!==null)?basis as Array<(x:number)=>number>:null;
}
const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const norm=(a:number[])=>Math.sqrt(dot(a,a));
export type Fit = {components:Complex[][];reconstruction:Complex[];rms:number;orthogonal:boolean;condition:number};
export function fitBasis(samples:Complex[],functions:Array<(x:number)=>number>,interval:[number,number],
 weighted:boolean,normalize:boolean):Fit|null{
 const n=samples.length,m=functions.length,[start,end]=interval;
 if(n<2||m<1||m>n||m>8||!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return null;
 const x=Array.from({length:n},(_,i)=>start+(end-start)*i/(n-1));
 const weights=x.map((_,i)=>weighted&&(i===0||i===n-1)?Math.SQRT1_2:1);
 const raw=functions.map(f=>x.map(f));
 const columns=raw.map(col=>col.map((v,i)=>v*weights[i]));
 const norms=columns.map(norm);
 if(norms.some(v=>!Number.isFinite(v)||v===0))return null;
 if(normalize)columns.forEach((col,i)=>{columns[i]=col.map(v=>v/norms[i]);});
 const orthogonal=columns.every((col,i)=>columns.slice(0,i).every(other=>Math.abs(dot(col,other))<=1e-9*norm(col)*norm(other)));
 const maxNorm=Math.max(...columns.map(norm));
 const q:number[][]=[],r=Array.from({length:m},()=>Array<number>(m).fill(0));
 for(let j=0;j<m;j++){
  let v=columns[j].slice();
  // Reorthogonalized modified Gram–Schmidt for the small column set.
  for(let pass=0;pass<2;pass++)for(let i=0;i<j;i++){
   const projection=dot(q[i],v);
   r[i][j]+=projection;
   v=v.map((value,k)=>value-projection*q[i][k]);
  }
  r[j][j]=norm(v);
  if(r[j][j]<=maxNorm*1e-11)return null;
  q.push(v.map(value=>value/r[j][j]));
 }
 function backSolve(rhs:number[]){
  const coefficients=rhs.slice();
  for(let i=m-1;i>=0;i--){
   for(let j=i+1;j<m;j++)coefficients[i]-=r[i][j]*coefficients[j];
   coefficients[i]/=r[i][i];
  }
  return coefficients;
 }
 const matrixNorm=(a:number[][])=>Math.max(...a.map(row=>row.reduce((sum,value)=>sum+Math.abs(value),0)));
 const inverseColumns=q.map((_,j)=>backSolve(q.map((_,i)=>Number(i===j))));
 const inverse=q.map((_,i)=>inverseColumns.map(col=>col[i]));
 const condition=matrixNorm(r)*matrixNorm(inverse);
 if(!Number.isFinite(condition)||condition>1e11)return null;
 const re=backSolve(q.map(col=>dot(col,samples.map((p,i)=>p.re*weights[i]))));
 const im=backSolve(q.map(col=>dot(col,samples.map((p,i)=>p.im*weights[i]))));
 const components=raw.map((col,j)=>col.map(value=>{
  const v=normalize?value/norms[j]:value;
  return {re:v*re[j],im:v*im[j]};
 }));
 const reconstruction=samples.map((_,i)=>components.reduce((sum,row)=>({re:sum.re+row[i].re,im:sum.im+row[i].im}),{re:0,im:0}));
 const rms=Math.sqrt(samples.reduce((sum,p,i)=>sum+(p.re-reconstruction[i].re)**2+(p.im-reconstruction[i].im)**2,0)/n);
 return {components,reconstruction,rms,orthogonal,condition};
}
