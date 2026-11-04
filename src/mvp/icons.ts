import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {iconNames} from "../../scripts/public-mvp-contract.mjs";
export async function icon(name:string){
 if(!iconNames.includes(name))return new Response(null,{status:404});
 return new Response(await readFile(resolve("public/icons",name)),{headers:{"Content-Type":name.endsWith("svg")?"image/svg+xml":"image/png"}});
}
