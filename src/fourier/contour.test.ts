import {expect,it} from "vitest";
import {compareBases,contourShape,smoothContour} from "./contour";
import {normalizeContour} from "./math";
import {projectBasis} from "./bases";
it("builds shapes independently of the selected basis",()=>{
 const circle=contourShape("circle",5);
 expect(circle).toHaveLength(160);
 expect(circle.every(p=>Math.abs(Math.hypot(p.re,p.im)-1)<1e-12)).toBe(true);
 expect(contourShape("square",8)).toHaveLength(4);
 expect(contourShape("rectangle",8).map(p=>p.im)).toEqual([-.58,-.58,.58,.58]);
 expect(contourShape("triangle",5)).toHaveLength(3);
 expect(contourShape("polygon",7)).toHaveLength(7);
});
it("preserves open endpoints when smoothing and compares the same signal",()=>{
 const points=[{re:0,im:0},{re:1,im:2},{re:2,im:0}];
 expect(smoothContour(points,false)).toEqual([points[0],{re:1,im:1},points[2]]);
 expect(smoothContour(points,true)[0]).toEqual({re:.75,im:.5});
 const samples=normalizeContour(contourShape("rectangle",4));
 expect(compareBases(samples,128).every(row=>row.rms<1e-11)).toBe(true);
 expect(compareBases(samples,1).every(row=>row.rms>0)).toBe(true);
 expect(projectBasis([],"walsh")).toEqual([]);
});
