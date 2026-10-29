import { useEffect, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { StrokeDraft, type Point } from "./gestures";
export { svgPoint } from "./gestures";
type Options = { svgRef: RefObject<SVGSVGElement|null>; previewRef: RefObject<SVGPolylineElement|null>; toPoint: (event: Pick<PointerEvent,"clientX"|"clientY">)=>Point; onCommit:(points:Point[])=>void; onStart?:()=>void; onFinish?:()=>void; enabled?:boolean };
export function usePointerStroke(options: Options) {
 const current=useRef(options);current.current=options;const draft=useRef(new StrokeDraft()),frame=useRef(0);
 const clear=()=>{cancelAnimationFrame(frame.current);frame.current=0;current.current.previewRef.current?.setAttribute("points","");};
 const paint=()=>{if(frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=0;current.current.previewRef.current?.setAttribute("points",draft.current.points.map(p=>`${p.x},${p.y}`).join(" "));});};
 const consume=(event:ReactPointerEvent<SVGSVGElement>)=>{const native=event.nativeEvent;const batch=native.getCoalescedEvents?.()??[];for(const e of batch)draft.current.append(event.pointerId,current.current.toPoint(e));draft.current.append(event.pointerId,current.current.toPoint(event));};
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);draft.current.pointer=null;draft.current.points=[];},[]);
 const abort=(event:ReactPointerEvent<SVGSVGElement>)=>{if(draft.current.pointer!==event.pointerId)return;draft.current.cancel(event.pointerId);clear();current.current.onFinish?.();};
 return {
 onPointerDown:(event:ReactPointerEvent<SVGSVGElement>)=>{if(current.current.enabled===false||!event.isPrimary||event.button!==0||event.altKey)return;if(!draft.current.begin(event.pointerId,current.current.toPoint(event)))return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);current.current.onStart?.();paint();},
 onPointerMove:(event:ReactPointerEvent<SVGSVGElement>)=>{if(draft.current.pointer!==event.pointerId)return;consume(event);paint();},
 onPointerUp:(event:ReactPointerEvent<SVGSVGElement>)=>{if(draft.current.pointer!==event.pointerId)return;consume(event);const points=draft.current.finish(event.pointerId);clear();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(points?.length)current.current.onCommit(points);current.current.onFinish?.();},
 onPointerCancel:abort,onLostPointerCapture:abort,
 };
}
