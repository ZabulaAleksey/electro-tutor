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

export function bigintRatio(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return NaN;
  if (numerator === 0n) return 0;
  const a = abs(numerator), b = abs(denominator);
  const aShift = Math.max(0, a.toString(2).length - 53);
  const bShift = Math.max(0, b.toString(2).length - 53);
  const magnitude = Number(a >> BigInt(aShift)) / Number(b >> BigInt(bShift)) * 2 ** (aShift - bShift);
  return (numerator < 0n) === (denominator < 0n) ? magnitude : -magnitude;
}

/** Represent the actual IEEE 754 value exactly, including subnormal values. */
export function binaryRatio(value: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isFinite(value)) throw Error("invalid-lc-equivalence-number");
  if (value === 0) return { numerator: 0n, denominator: 1n };
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  const bits = bytes.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const shift = exponent ? exponent - 1075 : -1074;
  const signed = value < 0 ? -fraction : fraction;
  if (shift >= 0) return { numerator: signed << BigInt(shift), denominator: 1n };
  const denominator = 1n << BigInt(-shift);
  const divisor = gcd(signed, denominator);
  return { numerator: signed / divisor, denominator: denominator / divisor };
}

/** Evaluate two integer polynomials at the same binary argument without
 * cancellation from rounding intermediate products. */
export function ratioAt(numerator: Polynomial, denominator: Polynomial, x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x === 0) return bigintRatio(numerator[0], denominator[0]);
  const { numerator: a, denominator: b } = binaryRatio(x);
  const degree = Math.max(numerator.length, denominator.length) - 1;
  function evaluate(p: Polynomial): bigint {
    let result = p[degree] ?? 0n;
    let denominatorPower = 1n;
    for (let i = degree - 1; i >= 0; i--) {
      denominatorPower *= b;
      result = result * a + (p[i] ?? 0n) * denominatorPower;
    }
    return result;
  }
  return bigintRatio(evaluate(numerator), evaluate(denominator));
}
