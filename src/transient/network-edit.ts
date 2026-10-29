import {boundaries,type Load,type Network} from "./network";
export function replaceLoad(root:Load,id:string,next:Load):Load{return root.id===id?next:{...root,children:root.children?.map(c=>replaceLoad(c,id,next))};}
export function removeLoad(root:Load,id:string):Load{if(root.id===id)return {id:root.id,kind:"open"};return {...root,children:root.children?.filter(c=>c.id!==id).map(c=>removeLoad(c,id))};}
export function sectionBoundaries(c:Network){return boundaries(c).slice(1,-1).map((x,j)=>({x,label:`${c.sections[j].id} | ${c.sections[j+1].id}`}));}
