import { describe, expect, it } from "vitest";
import { routeLeadPair, type RoutingBox, type RoutingPoint } from "./network-routing";

const box = (x:number,y:number,w:number,h:number): RoutingBox =>
  ({left:x-w,right:x+w,top:y-h,bottom:y+h});
const segments = (points:RoutingPoint[]) => points.slice(1).map((point,index) => {
  const from = points[index];
  return {left:Math.min(from.x,point.x),right:Math.max(from.x,point.x),
    top:Math.min(from.y,point.y),bottom:Math.max(from.y,point.y)};
});
const overlaps = (a:RoutingBox,b:RoutingBox) => a.left<=b.right && a.right>=b.left && a.top<=b.bottom && a.bottom>=b.top;

describe("terminal lead routing", () => {
  it("preserves terminal identities across a grid of positions and rotations", () => {
    const obstacles = [box(135,84,54,7),box(135,213,120,1)];
    for (const x of [260,290,355]) for (const y of [26,82,148,270]) {
      for (const axis of [{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}]) {
        const point = (distance:number) => ({x:x+distance*axis.x,y:y+distance*axis.y});
        const signal = {node:{x:228,y:84},pin:point(-23),exit:point(-35)};
        const ground = {node:{x:290,y:213},pin:point(23),exit:point(35)};
        const body = box(x,y,axis.x ? 23 : 13,axis.y ? 23 : 13);
        const routed = routeLeadPair([signal,ground],obstacles,body);
        expect(routed, JSON.stringify({x,y,axis})).not.toBeNull();
        const [a,b] = routed!;
        expect([a[0],a.at(-1),b[0],b.at(-1)]).toEqual([signal.node,signal.pin,ground.node,ground.pin]);
        for (const route of [a,b]) {
          const wires = segments(route);
          expect(wires.every(segment => segment.left===segment.right || segment.top===segment.bottom)).toBe(true);
          expect(wires.every(segment => obstacles.every(block => !overlaps(segment,block)))).toBe(true);
          expect(wires.slice(0,-1).every(segment => !overlaps(segment,body))).toBe(true);
        }
        expect(segments(a).every(segment => segments(b).every(other => !overlaps(segment,other)))).toBe(true);
      }
    }
  });

  it("rejects a proposed load position overlapping its fixed signal node", () => {
    expect(routeLeadPair([
      {node:{x:228,y:84},pin:{x:238,y:59},exit:{x:238,y:47}},
      {node:{x:290,y:213},pin:{x:238,y:105},exit:{x:238,y:117}},
    ],[box(135,84,54,7)],box(238,82,13,23))).toBeNull();
  });

  it("rejects an escape that enters an occupied symbol", () => {
    expect(routeLeadPair([
      {node:{x:0,y:0},pin:{x:40,y:40},exit:{x:40,y:30}},
      {node:{x:0,y:100},pin:{x:40,y:60},exit:{x:40,y:70}},
    ],[box(40,34,4,4)],box(40,50,8,10))).toBeNull();
  });
});
