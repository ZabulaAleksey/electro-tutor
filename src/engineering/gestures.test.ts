import { describe,it,expect } from "vitest";
import { StrokeDraft,zoomAt } from "./gestures";
describe("gesture model contract",()=>{
 it("keeps long coalesced drafts uncommitted until one matching pointerup",()=>{const d=new StrokeDraft();expect(d.begin(1,{x:0,y:0})).toBe(true);for(let i=1;i<=10000;i++)d.append(1,{x:i,y:i/3});expect(d.finish(2)).toBeNull();expect(d.points).toHaveLength(10001);const result=d.finish(1);expect(result).toHaveLength(10001);expect(d.finish(1)).toBeNull();});
 it("cancellation and another finger preserve the previous model",()=>{const committed=[{x:2,y:3}],d=new StrokeDraft();d.begin(4,{x:0,y:0});expect(d.begin(5,{x:9,y:9})).toBe(false);d.cancel(5);expect(d.pointer).toBe(4);d.cancel(4);expect(d.points).toEqual([]);expect(committed).toEqual([{x:2,y:3}]);});
 it("cursor anchor survives zoom, bounds and reset math",()=>{const z=1.7,pan={x:21,y:-9},center={x:260,y:190},anchor={x:411,y:61};for(const factor of [.1,.9,1.3,100]){const r=zoomAt(z,pan,anchor,center,factor);expect((anchor.x-center.x-r.pan.x)/r.zoom).toBeCloseTo((anchor.x-center.x-pan.x)/z,12);expect((anchor.y-center.y-r.pan.y)/r.zoom).toBeCloseTo((anchor.y-center.y-pan.y)/z,12);expect(r.zoom).toBeGreaterThanOrEqual(.5);expect(r.zoom).toBeLessThanOrEqual(4);}});
});
