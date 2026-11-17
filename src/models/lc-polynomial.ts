export type Polynomial = bigint[];
export type Fraction = { numerator:Polynomial; denominator:Polynomial };

const trim = (p:Polynomial) => {
 while(p.length>1&&p.at(-1)===0n)p.pop();
 return p;
};
const zero=(p:Polynomial)=>p.length===1&&p[0]===0n;
export const scale=(p:Polynomial,k:bigint)=>p.map(c=>c*k);
export const add=(a:Polynomial,b:Polynomial)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]??0n)+(b[i]??0n)));
export const shift=(p:Polynomial,count:number)=>[...Array<bigint>(count).fill(0n),...p];
export function multiply(a:Polynomial,b:Polynomial){
 const p=Array<bigint>(a.length+b.length-1).fill(0n);
 a.forEach((v,i)=>b.forEach((w,j)=>p[i+j]+=v*w));
 return trim(p);
}
export const abs=(n:bigint)=>n<0n?-n:n;
export function gcd(a:bigint,b:bigint):bigint{
 while(b!==0n)[a,b]=[b,a%b];
 return abs(a);
}
const content=(p:Polynomial)=>p.reduce(gcd,0n);
function primitive(p:Polynomial){
 const k=content(p);
 return k===0n?p:p.map(c=>c/k);
}
function polynomialGcd(a:Polynomial,b:Polynomial){
 while(!zero(b)){
  while(!zero(a)&&a.length>=b.length){
   a=primitive(add(scale(a,b.at(-1)!),scale(shift(b,a.length-b.length),-a.at(-1)!)));
  }
  [a,b]=[b,a];
 }
 return primitive(a);
}
export function exactQuotient(a:Polynomial,b:Polynomial){
 if(zero(a))return [0n];
 if(a.length<b.length)throw Error("nonzero remainder");
 const quotient=Array<bigint>(a.length-b.length+1).fill(0n);
 while(!zero(a)&&a.length>=b.length){
  const index=a.length-b.length, lead=a.at(-1)!;
  if (lead % b.at(-1)! !== 0n)throw Error("non-integral quotient");
  const factor=lead/b.at(-1)!;
  quotient[index]=factor;
  a=add(a,scale(shift(b,index),-factor));
 }
 if(!zero(a))throw Error("nonzero remainder");
 return trim(quotient);
}
export function reduce(n:Polynomial,d:Polynomial):Fraction{
 const factor=polynomialGcd(n,d);
 const numerator=exactQuotient(n,factor),denominator=exactQuotient(d,factor);
 const k=gcd(content(numerator),content(denominator))*(denominator.at(-1)!<0n?-1n:1n);
 return {numerator:numerator.map(c=>c/k),denominator:denominator.map(c=>c/k)};
}
