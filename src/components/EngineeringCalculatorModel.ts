import {dc,rc} from "../showcase/physics";
export const calculateSeries=(u:number,r1:number,r2:number)=>{if(![u,r1,r2].every(Number.isFinite)||u<0||r1<=0||r2<=0)throw new RangeError("Invalid series parameters");const value=dc(u,r1,r2);return {current:value.i,u1:value.u1,u2:value.u2};};
export const calculateRc=(u:number,r:number,c:number,t:number)=>{if(![u,r,c,t].every(Number.isFinite)||u<0||r<=0||c<=0||t<0)throw new RangeError("Invalid RC parameters");const value=rc(t,r,c,u);return{tau:value.tau,value:value.uc};};
