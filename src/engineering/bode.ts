import type { EngineeringPlotData, PlotPoint } from "./plot";
/** The supported RC low-pass has exactly one stable real pole. Not a general solver. */
export function firstOrderBode(tau:number,gain=1) {
  if(!(tau>0)||!(gain>0)||![tau,gain].every(Number.isFinite))throw new RangeError("Positive finite first-order parameters required");
  const omegaC=1/tau, base=20*Math.log10(gain);
  const exact=(omega:number)=>({magnitude:base-10*Math.log10(1+(omega*tau)**2),phase:-Math.atan(omega*tau)*180/Math.PI});
  const asymptote=(omega:number)=>base-20*Math.max(0,Math.log10(omega/omegaC));
  const frequencies=Array.from({length:161},(_,k)=>omegaC*10**(-2+k/40));
  const values=(fn:(w:number)=>number):PlotPoint[]=>frequencies.map(w=>[w,fn(w)]);
  const common={xLabel:"ω, rad/s",xMin:omegaC/100,xMax:omegaC*100,logarithmic:true};
  const amplitude:EngineeringPlotData={...common,yLabel:"L, dB",yMin:base-45,yMax:base+5,curves:[{label:"L",color:"blue",points:values(w=>exact(w).magnitude)},{label:"Lasym",color:"violet",dash:true,points:values(asymptote)}]};
  const phase:EngineeringPlotData={...common,yLabel:"φ, °",yTickStep:45,yMin:-90,yMax:0,curves:[{label:"φ",color:"violet",points:values(w=>exact(w).phase)}]};
  return {tau,gain,omegaC,exact,asymptote,amplitude,phase,factors:[{id:"K",gain},{id:"pole",expression:"1/(1+τp)",omegaC,slopeChange:-20}],slopes:[0,-20]};
}
