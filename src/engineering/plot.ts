import { engineeringAxis, type AxisOptions } from "./scale";
export type PlotPoint = readonly [number,number];
export type EngineeringPlotData = { xLabel:string;yLabel:string;xMin?:number;xMax:number;yMin:number;yMax:number;logarithmic?:boolean;yTickStep?:number;categories?:string[];curves:{label:string;color:string;dash?:boolean;points:PlotPoint[]}[] };
export function validatePlotData(plot: EngineeringPlotData) {
  const errors:string[]=[];
  if(!plot.xLabel.trim()||!plot.yLabel.trim()) errors.push("missing-axis-label");
  if((!plot.xLabel.includes(",")&&!plot.categories)||!plot.yLabel.includes(","))errors.push("missing-axis-unit");
  if(plot.logarithmic&&((plot.xMin??0)<=0||plot.xMax<=0))errors.push("invalid-log-domain");
  if(![plot.xMin??0,plot.xMax,plot.yMin,plot.yMax].every(Number.isFinite))errors.push("non-finite-domain");
  for(const curve of plot.curves) for(const [x,y] of curve.points) if(!Number.isFinite(x)||!Number.isFinite(y)||plot.logarithmic&&x<=0)errors.push("invalid-sample");
  return [...new Set(errors)];
}
export function plotAxes(plot: EngineeringPlotData, points: readonly PlotPoint[] = [], options: AxisOptions = {}) {
  if(validatePlotData(plot).length) throw new RangeError("Invalid engineering plot data");
  let xmin=plot.xMin??0,xmax=plot.xMax,ymin=plot.yMin,ymax=plot.yMax;
  for(const p of [...plot.curves.flatMap(c=>c.points),...points]) {xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}
  return {x:engineeringAxis(xmin,xmax,{...options,logarithmic:plot.logarithmic,step:plot.categories?1:options.step}),y:engineeringAxis(ymin,ymax,{...options,step:plot.yTickStep})};
}
export function nearestSample(points:readonly PlotPoint[], x:number):PlotPoint|undefined {return points.reduce<PlotPoint|undefined>((best,p)=>!best||Math.abs(p[0]-x)<Math.abs(best[0]-x)?p:best,undefined);}
