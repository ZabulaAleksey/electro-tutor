import { engineeringAxis } from "../engineering/scale";
import { chooseEngineeringUnit, formatEngineeringNumber, inEngineeringUnit, type EngineeringLocale } from "../engineering/format";
export type PlotGeometry={left:number;right:number;domainX:readonly[number,number]};
type PlotOptions = { title:string;unit:string;color:string;zero:string;grid:string;ink:string;lengthM?:number;language?:EngineeringLocale;reference?:number };
export function sampleAtFraction(fraction:number,count:number,lengthM:number,domainMax=lengthM){const index=Math.max(0,Math.min(count-1,Math.round(Math.max(0,Math.min(1,fraction))*domainMax/lengthM*(count-1))));return {index,x:count>1?index/(count-1)*lengthM:0};}
/** Only presentation: the solver's Float64Array is never changed. */
export function drawSpatial(canvas:HTMLCanvasElement,values:Float64Array,options:PlotOptions):PlotGeometry|undefined {
 const width=Math.max(320,Math.round(canvas.getBoundingClientRect().width)),height=240,dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);const c=canvas.getContext("2d");if(!c)return;
 c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
 const right=width-22,top=30,bottom=height-36,language=options.language??"ru",length=options.lengthM??1;
 c.font="12px system-ui, sans-serif";
 let low=0,high=0;for(const value of values){if(!Number.isFinite(value)){c.fillStyle=options.ink;c.fillText("Invalid plot data",58,top);return;}low=Math.min(low,value);high=Math.max(high,value);}
 const ya=engineeringAxis(low,high,{pixels:bottom-top,includeZero:true,targetTicks:5});
 const u=chooseEngineeringUnit(options.unit,options.reference||Math.max(Math.abs(low),Math.abs(high)),language),xu=chooseEngineeringUnit("m",length,language);
 const labels=ya.ticks.map(v=>formatEngineeringNumber(inEngineeringUnit(v,u),language));
 const left=Math.min(width*.4,Math.max(58,...labels.map(v=>c.measureText(v).width+14))),xa=engineeringAxis(0,length,{pixels:right-left});
 canvas.dataset.axisXUnit=xu.symbol;canvas.dataset.axisYUnit=u.symbol;canvas.setAttribute("aria-description",`x, ${xu.symbol}; ${options.title}, ${u.symbol}`);
 const x=(v:number)=>left+xa.position(v)*(right-left),y=(v:number)=>bottom-ya.position(v)*(bottom-top),zeroY=y(0);
 c.lineWidth=.6;c.strokeStyle=options.grid;c.globalAlpha=.35;
 for(const v of ya.minorTicks){c.beginPath();c.moveTo(left,y(v));c.lineTo(right,y(v));c.stroke();}for(const v of xa.minorTicks){c.beginPath();c.moveTo(x(v),top);c.lineTo(x(v),bottom);c.stroke();}
 c.globalAlpha=1;c.lineWidth=1;c.fillStyle=options.ink;c.font="12px system-ui, sans-serif";
 for(const v of ya.ticks){const py=y(v);c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();c.textAlign="right";c.fillText(formatEngineeringNumber(inEngineeringUnit(v,u),language),left-9,py+4);c.textAlign="left";}
 for(const v of xa.ticks){const px=x(v);c.beginPath();c.moveTo(px,top);c.lineTo(px,bottom);c.stroke();c.fillText(formatEngineeringNumber(inEngineeringUnit(v,xu),language),px-4,Math.min(height-10,zeroY+16));}
 c.strokeStyle=options.zero;c.lineWidth=1.5;c.beginPath();c.moveTo(left,zeroY);c.lineTo(right,zeroY);c.stroke();
 c.fillText(`${options.title}, ${u.symbol}`,left,17);c.fillText(`x, ${xu.symbol}`,right-48,height-4);
 if(values.length>=2){c.strokeStyle=options.color;c.lineWidth=2.5;c.lineJoin="round";c.beginPath();for(let k=0;k<values.length;k++){const px=x(k/(values.length-1)*length),py=y(values[k]);if(k)c.lineTo(px,py);else c.moveTo(px,py);}c.stroke();
  c.fillStyle=options.color;for(const k of [0,values.length-1])if(values[k]!==0){const text=formatEngineeringNumber(inEngineeringUnit(values[k],u),language);c.fillText(text,Math.max(left+5,Math.min(right-c.measureText(text).width-4,x(k/(values.length-1)*length)+5)),Math.max(top+12,Math.min(bottom-5,y(values[k])-9)));}}
 return {left,right,domainX:xa.domain};
}
