import type { Page } from '@playwright/test';

type Request = { kind?: string; resistance?: number; sourceResistance?: number; cells?: number; times?: number[]; step?: number; reset?: boolean };
export type WasmSnapshot = { time: number; step: number; diagnostics: number[]; voltages: number[]; currents: number[] };

/** Retained FDTD numerical contract, exercised in a real browser Worker, independently of the new constructor UI. */
export async function wasmLine(page: Page, requests: Request[]): Promise<WasmSnapshot[][]> {
  const prefix = new URL(page.url()).pathname.split(/\/(?:ru|uk)\//)[0];
  return page.evaluate(async ({ requests, moduleUrl, wasmUrl }) => {
    const [moduleSource, wasmBytes] = await Promise.all([fetch(moduleUrl).then(r=>{if(!r.ok)throw new Error("WASM module unavailable");return r.text()}),fetch(wasmUrl).then(r=>{if(!r.ok)throw new Error("WASM binary unavailable");return r.arrayBuffer()})]);
    const moduleBlob=URL.createObjectURL(new Blob([moduleSource],{type:"text/javascript"}));
    const source = `onmessage=async({data})=>{try{
      const m=await import(data.moduleUrl);await m.default({module_or_path:data.wasmBytes});
      const results=data.requests.map(r=>{
        const s=new m.WasmSimulation(1e6,2e8,50,r.cells??1000,.9,100,r.sourceResistance??0,0,r.kind??'open','series',r.resistance??50,.02,1e-5,0,0);
        const snapshot=()=>({time:s.time_s(),step:s.step_index(),diagnostics:Array.from(s.diagnostics()),voltages:Array.from(s.voltages()),currents:Array.from(s.currents())});
        try{const samples=(r.times??[]).map(t=>{s.seek(t);return snapshot()});if(r.step){s.step_many(r.step);samples.push(snapshot())}if(r.reset){s.reset();samples.push(snapshot())}return samples}finally{s.free()}
      });postMessage({results});
    }catch(e){postMessage({error:String(e)})}}`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url, { type: 'module' });
    try {
      return await new Promise<WasmSnapshot[][]>((resolve, reject) => {
        worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.results);
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ requests, moduleUrl:moduleBlob, wasmBytes },[wasmBytes]);
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url);URL.revokeObjectURL(moduleBlob); }
  }, { requests, moduleUrl: new URL(`${prefix}/transient-core/transient_core.js`, page.url()).href, wasmUrl: new URL(`${prefix}/transient-core/transient_core_bg.wasm`, page.url()).href });
}
