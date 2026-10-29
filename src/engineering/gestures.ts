export type Point = { x: number; y: number };
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const matrix = svg.getScreenCTM();
  if (matrix) { const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y }; }
  const r = svg.getBoundingClientRect(), box = svg.viewBox.baseVal;
  const scale = Math.min(r.width / box.width, r.height / box.height) || 1;
  return { x: box.x + (clientX-r.left-(r.width-box.width*scale)/2)/scale, y: box.y + (clientY-r.top-(r.height-box.height*scale)/2)/scale };
}
export function zoomAt(zoom: number, pan: Point, anchor: Point, center: Point, factor: number, min=.5, max=4) {
  const next = Math.max(min, Math.min(max, zoom*factor)), ratio=next/zoom;
  return { zoom: next, pan: { x: pan.x*ratio+(anchor.x-center.x)*(1-ratio), y: pan.y*ratio+(anchor.y-center.y)*(1-ratio) } };
}
/** A draft is separate from committed model/history; unrelated pointers cannot finish it. */
export class StrokeDraft {
  pointer: number | null = null;
  points: Point[] = [];
  begin(pointer: number, p: Point) { if (this.pointer !== null) return false; this.pointer=pointer;this.points=[p];return true; }
  append(pointer: number,p:Point) { if(this.pointer!==pointer)return; const last=this.points.at(-1);if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&(!last||last.x!==p.x||last.y!==p.y))this.points.push(p); }
  finish(pointer:number) { if(this.pointer!==pointer)return null;const result=this.points;this.pointer=null;this.points=[];return result; }
  cancel(pointer:number) { if(this.pointer===pointer){this.pointer=null;this.points=[];} }
}
