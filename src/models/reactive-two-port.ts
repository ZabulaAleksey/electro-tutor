/** Ideal LC series/parallel tree. q = s / 1000; coefficients are exact integers. */
export type Circuit = {kind:"l"|"c"; value:number} | {kind:"series"|"parallel"; left:Circuit; right:Circuit};
export type Path = readonly ("left"|"right")[];
type Polynomial = bigint[];
type Fraction = { numerator:Polynomial; denominator:Polynomial };
export type Step = { circuit:Circuit; impedance:Fraction };
export const MIN_VALUE=.001, MAX_VALUE=100000;
export const MAX_LEAVES=8, MAX_DEPTH=4;
const trim = (p:Polynomial) => {
 while(p.length>1&&p.at(-1)===0n)p.pop();
 return p;
};
const zero=(p:Polynomial)=>p.length===1&&p[0]===0n;
const scale=(p:Polynomial,k:bigint)=>p.map(c=>c*k);
const add=(a:Polynomial,b:Polynomial)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]??0n)+(b[i]??0n)));
const shift=(p:Polynomial,count:number)=>[...Array<bigint>(count).fill(0n),...p];
function multiply(a:Polynomial,b:Polynomial){
 const p=Array<bigint>(a.length+b.length-1).fill(0n);
 a.forEach((v,i)=>b.forEach((w,j)=>p[i+j]+=v*w));
 return trim(p);
}
const abs=(n:bigint)=>n<0n?-n:n;
function gcd(a:bigint,b:bigint):bigint{
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
function exactQuotient(a:Polynomial,b:Polynomial){
 const quotient=Array<bigint>(a.length-b.length+1).fill(0n);
 while(!zero(a)&&a.length>=b.length){
  const index=a.length-b.length, lead=a.at(-1)!;
  if(lead%b.at(-1)!!==0n)throw Error("non-integral quotient");
  const factor=lead/b.at(-1)!;
  quotient[index]=factor;
  a=add(a,scale(shift(b,index),-factor));
 }
 if(!zero(a))throw Error("nonzero remainder");
 return trim(quotient);
}
function reduce(n:Polynomial,d:Polynomial):Fraction{
 const factor=polynomialGcd(n,d);
 const numerator=exactQuotient(n,factor),denominator=exactQuotient(d,factor);
 const k=gcd(content(numerator),content(denominator))*(denominator.at(-1)!<0n?-1n:1n);
 return {numerator:numerator.map(c=>c/k),denominator:denominator.map(c=>c/k)};
}

export function isGroup(c:Circuit):c is Extract<Circuit,{left:Circuit}>{return "left" in c;}
export const isNominal=(value:unknown):value is number=>typeof value==="number"&&value>=MIN_VALUE&&value<=MAX_VALUE&&
 Math.abs(value*1000-Math.round(value*1000))<2e-8;

export function readCircuit(input:unknown):Circuit|null{
 let leaves=0;
 function visit(raw:unknown,depth:number):Circuit|null{
  if(!raw||typeof raw!=="object"||depth>MAX_DEPTH)return null;
  const node=raw as Record<string,unknown>;
  if(node.kind==="l"||node.kind==="c")return ++leaves<=MAX_LEAVES&&isNominal(node.value)?{kind:node.kind,value:node.value}:null;
  if(node.kind!=="series"&&node.kind!=="parallel")return null;
  const left=visit(node.left,depth+1),right=visit(node.right,depth+1);
  return left&&right?{kind:node.kind,left,right}:null;
 }
 return visit(input,0);
}
export function replaceCircuit(root:Circuit,path:Path,replacement:Circuit):Circuit{
 if(!path.length)return replacement;
 if(!isGroup(root))return root;
 const [side,...rest]=path;
 return {...root,[side]:replaceCircuit(root[side],rest,replacement)};
}

export function solveCircuit(root:Circuit){
 const steps:Step[]=[];
 function fold(node:Circuit):Fraction{
  if(!isGroup(node)){
   const ticks=BigInt(Math.round(node.value*1000));
   return node.kind==="l"?reduce([0n,ticks],[1000n]):reduce([1000000n],[0n,ticks]);
  }
  const a=fold(node.left), b=fold(node.right);
  const cross=add(multiply(a.numerator,b.denominator),multiply(b.numerator,a.denominator));
  const impedance=node.kind==="series"?reduce(cross,multiply(a.denominator,b.denominator)):
    reduce(multiply(a.numerator,b.numerator),cross);
  steps.push({circuit:node,impedance});
  return impedance;
 }
 return {impedance:fold(root),steps};
}

function parity(p:Polynomial){return p[0]===0n?1:0;}
function atImaginarySquare(p:Polynomial):Polynomial{
 const start=parity(p);
 return p.filter((_,i)=>i%2===start).map((c,i)=>i%2===0?c:-c);
}
const evaluate=(p:Polynomial,x:number)=>p.reduceRight((sum,c)=>sum*x+Number(c),0);

/** Sign at a positive double, using its exact binary fraction. */
function signAt(p:Polynomial,x:number){
 if(x===0)return Math.sign(Number(p[0]));
 const bits=new DataView(new ArrayBuffer(8));
 bits.setFloat64(0,x);
 const word=bits.getBigUint64(0),exponent=Number((word>>52n)&2047n);
 const mantissa=(word&((1n<<52n)-1n))+(exponent?1n<<52n:0n);
 const shift=exponent?exponent-1075:-1074;
 const a=shift>=0?mantissa<<BigInt(shift):mantissa;
 const b=shift>=0?1n:1n<<BigInt(-shift);
 let sum=p.at(-1)!,power=1n;
 for(let i=p.length-2;i>=0;i--){
  power*=b;
  sum=sum*a+p[i]*power;
 }
 return sum<0n?-1:sum>0n?1:0;
}
function positiveRoots(p:Polynomial):number[]{
 if(p.length<=1)return [];
 const lead=p.at(-1)!;
 const upper=2+Math.max(...p.slice(0,-1).map(c=>Math.abs(Number(c)/Number(lead))));
 const derivative=p.slice(1).map((c,i)=>c*BigInt(i+1));
 const cuts=[0,...positiveRoots(derivative).filter(x=>x<upper),upper],roots:number[]=[];
 for(let i=1;i<cuts.length;i++){
  let low=cuts[i-1],high=cuts[i];
  const lowSign=signAt(p,low),highSign=signAt(p,high);
  if(highSign===0){roots.push(high);continue;}
  if(!lowSign||lowSign===highSign)continue;
  for(let iter=0;iter<220;iter++){
   const mid=low+(high-low)/2;
   if(mid===low||mid===high)break;
   const s=signAt(p,mid);
   if(!s){low=high=mid;break;}
   if(s===lowSign)low=mid;else high=mid;
  }
  roots.push(low+(high-low)/2);
 }
 return roots;
}
export type Resonance={kind:"zero"|"pole"; omega:number};
export function resonances(z:Fraction):Resonance[]{
 return ([["zero",z.numerator],["pole",z.denominator]] as const)
  .flatMap(([kind,p])=>positiveRoots(atImaginarySquare(p)).map(x=>({kind,omega:1000*Math.sqrt(x)})))
  .sort((a,b)=>a.omega-b.omega);
}
export function reactance(z:Fraction,omega:number){
 const w=omega/1000;
 const inductive=parity(z.numerator)===1;
 return (inductive?w:-1/w)*evaluate(atImaginarySquare(z.numerator),w*w)/evaluate(atImaginarySquare(z.denominator),w*w);
}
export function limits(z:Fraction){
 return {dc:parity(z.numerator)?"zero":"pole", high:z.numerator.length>z.denominator.length?"pole":"zero"} as const;
}
export function polynomialText(p:Polynomial){
 return p.map((c,i)=>({c,i})).reverse().filter(({c})=>c!==0n)
  .map(({c,i},index)=>{
   const magnitude=abs(c);
   const term=(i===0||magnitude!==1n?String(magnitude):"")+(i===0?"":i===1?"q":"q^"+i);
   return (c<0n?(index?" − ":"−"):index?" + ":"")+term;
  }).join("")||"0";
}
export const fractionText=({numerator,denominator}:Fraction)=>`(${polynomialText(numerator)}) / (${polynomialText(denominator)})`;
export function factorText(z:Fraction,roots:Resonance[],format:(x:number)=>string){
 const term=(kind:Resonance["kind"],p:Polynomial)=>{
  const factors=roots.filter(r=>r.kind===kind).map(r=>`(q² + ${format((r.omega/1000)**2)})`);
  return [...(parity(p)?["q"]:[]),...factors].join(" · ")||"1";
 };
 const gain=Number(z.numerator.at(-1)!)/Number(z.denominator.at(-1)!);
 return `${format(gain)} · ${term("zero",z.numerator)} / [${term("pole",z.denominator)}]`;
}
