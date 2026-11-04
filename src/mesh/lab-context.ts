import {meshPreset,type MeshExample} from '../models/mesh-current';
import {parameterKeys} from './presentation';
export const LAB_CONTEXT_KEY='potential-mesh-lab:mvp:v1';
export type LabContext={version:1;example:MeshExample;draft:Record<string,string>;active:string;loop:number};
export function parseLabContext(raw:string|null):LabContext|null {
 try {
  if(!raw||raw.length>4096)return null;
  const v=JSON.parse(raw);
  if(!v||v.version!==1||![1,2,3,4].includes(v.example)||!v.draft||Array.isArray(v.draft)||typeof v.draft!=='object')return null;
  const keys=parameterKeys(meshPreset(v.example));
  if(Object.keys(v.draft).length!==keys.length||!keys.every(k=>typeof v.draft[k]==='string'&&v.draft[k].length<=32)||!keys.includes(v.active)||!Number.isInteger(v.loop)||v.loop<1||v.loop>(v.example===3?3:2))return null;
  return {version:1,example:v.example,draft:Object.fromEntries(keys.map(k=>[k,v.draft[k]])),active:v.active,loop:v.loop};
 }catch{return null;}
}
