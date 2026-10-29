import { niceStep } from "./scale";
export function complexPlanePoint(value:{re:number;im:number},origin:{x:number;y:number},pixelsPerUnit:number) {
  return {x:origin.x+value.re*pixelsPerUnit,y:origin.y-value.im*pixelsPerUnit};
}
export function nicePixelsPerUnit(maximum:number,radius:number,cell=25) {return cell/niceStep(Math.max(Number.MIN_VALUE,maximum/(radius/cell)));}
