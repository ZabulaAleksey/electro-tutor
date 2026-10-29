import { useEffect, useRef, type RefObject } from "react";
import { svgPoint, type Point } from "./gestures";
export function useLocalZoom(ref:RefObject<SVGSVGElement|null>, onZoom:(point:Point,factor:number)=>void,enabled=true) {
 const current=useRef(onZoom);current.current=onZoom;
 useEffect(()=>{const svg=ref.current;if(!svg||!enabled)return;const wheel=(e:WheelEvent)=>{if(!e.ctrlKey||!e.deltaY)return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);current.current(svgPoint(svg,e.clientX,e.clientY),Math.exp(Math.max(-.3,Math.min(.3,-pixels*.002))));};svg.addEventListener("wheel",wheel,{passive:false});return()=>svg.removeEventListener("wheel",wheel);},[ref,enabled]);
}
