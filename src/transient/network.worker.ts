import {simulateNetwork,type Network} from "./network";

const worker=self as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void};
self.onmessage=({data:{id,config}}:MessageEvent<{id:number;config:Network}>)=>{
 let last=-Infinity;
 try{
  const run=simulateNetwork(config,{progress:fraction=>{
   const now=performance.now();
   if(now-last<60)return;
   last=now;
   worker.postMessage({id,progress:fraction});
  }});
  const buffers=new Set<Transferable>();
  for(const {times,values} of [...run.ports,run.deviceEnergy]){
   if(times instanceof Float64Array)buffers.add(times.buffer);
   if(values instanceof Float64Array)buffers.add(values.buffer);
  }
  worker.postMessage({id,run},[...buffers]);
 }catch(error){
  worker.postMessage({id,error:error instanceof Error?error.message:String(error)});
 }
};
