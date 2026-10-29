/** Real basis adapters corresponding to Fourier Sketch's indexed/Haar views. */
export type BasisName = "fourier" | "haar" | "dct" | "walsh";
export function haarBasis(n:number):number[][]{const out:number[][]=[];for(let k=0;k<n;k++){const row=Array(n).fill(0);if(k===0)row.fill(1/Math.sqrt(n));else{const level=Math.floor(Math.log2(k)),block=2**level,within=k-block,half=n/(2*block),start=within*2*half;for(let i=0;i<n;i++){if(i>=start&&i<start+half)row[i]=Math.sqrt(block/n);else if(i>=start+half&&i<start+2*half)row[i]=-Math.sqrt(block/n);}}out.push(row);}return out;}
export function dctII(values:number[]):number[]{const n=values.length;if(!n)return[];return values.map((_,k)=>Math.sqrt(2/n)*(k===0?1/Math.sqrt(2):1)*values.reduce((s,x,i)=>s+x*Math.cos(Math.PI*(i+.5)*k/n),0));}
export function walsh(values:number[]):number[]{const n=values.length;if(!n||(n&(n-1)))throw Error("Walsh basis requires power-of-two samples");const a=values.slice();for(let len=1;len<n;len*=2)for(let i=0;i<n;i+=2*len)for(let j=0;j<len;j++){const u=a[i+j],v=a[i+j+len];a[i+j]=u+v;a[i+j+len]=u-v;}return a.map(x=>x/Math.sqrt(n));}
export function projectBasis(values:number[],basis:Exclude<BasisName,"fourier">):number[]{
  if(basis==="dct")return dctII(values);
  if(basis==="walsh")return walsh(values);
  const rows=haarBasis(values.length);return rows.map(row=>row.reduce((sum,x,i)=>sum+x*values[i],0));
}
export function reconstructBasis(coefficients:number[],basis:Exclude<BasisName,"fourier">):number[]{
  const n=coefficients.length; if(!n)return[];
  if(basis==="dct")return Array.from({length:n},(_,i)=>coefficients.reduce((sum,c,k)=>sum+c*Math.sqrt(2/n)*(k===0?1/Math.sqrt(2):1)*Math.cos(Math.PI*(i+.5)*k/n),0));
  if(basis==="walsh")return walsh(coefficients);
  const rows=haarBasis(n);return Array.from({length:n},(_,i)=>rows.reduce((sum,row,k)=>sum+coefficients[k]*row[i],0));
}
