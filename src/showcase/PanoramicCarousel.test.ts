import {describe,expect,it} from "vitest";
import {panoramaPlots,panoramas} from "./panorama-model";
import {plotAxes,validatePlotData} from "../engineering/plot";
describe("panoramic analytical overlays",()=>{
 it("uses unique real destinations and valid SI plot ranges",()=>{expect(new Set(panoramas.map(p=>p.id)).size).toBe(4);for(const plot of Object.values(panoramaPlots)){expect(validatePlotData(plot)).toEqual([]);const axes=plotAxes(plot);for(const c of plot.curves)for(const [x,y]of c.points){expect(x).toBeGreaterThanOrEqual(axes.x.domain[0]);expect(x).toBeLessThanOrEqual(axes.x.domain[1]);expect(y).toBeGreaterThanOrEqual(axes.y.domain[0]);expect(y).toBeLessThanOrEqual(axes.y.domain[1]);}}});
 it("keeps DC slope and RC initial/steady limits consistent with the shown inputs",()=>{for(const [u,i]of panoramaPlots.dc.curves[0].points)expect(i*100).toBeCloseTo(u,12);const rc=panoramaPlots.transient.curves[0].points;expect(rc[0][1]).toBe(0);expect(rc.at(-1)![1]).toBeCloseTo(12*(1-Math.exp(-5)),12);});
 it("preserves three-phase sum and angular ticks without rounding data",()=>{const plot=panoramaPlots.machines;for(let k=0;k<plot.curves[0].points.length;k++)expect(plot.curves.reduce((sum,c)=>sum+c.points[k][1],0)).toBeCloseTo(0,12);expect(plotAxes(plot).x.ticks).toEqual([0,60,120,180,240,300,360]);});
 it("shows the exact reflected front at the same physical coordinate",()=>{const p=panoramaPlots.lines.curves[0].points;expect(p[1][0]).toBeLessThan(50000);expect(p[1][1]).toBe(50);expect(p[2][0]).toBe(50000);expect(p[2][1]).toBeCloseTo(50*(1+1/3),12);});
});
