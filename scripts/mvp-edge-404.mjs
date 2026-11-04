import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {publicPath} from './public-mvp-contract.mjs';

export function edgeRoutes(base='/') {
  const p=r=>publicPath(r,base);
  return {version:1,include:[p('/uk'),`${p('/uk')}/*`,p('/ru/interactive'),`${p('/ru/interactive')}/*`],exclude:[]};
}

export function edgeWorkerSource({html,headers:headerText}) {
  const lines=headerText.trimStart().split(/\r?\n/), headers={};
  assert.equal(lines[0],'/*','Edge policy requires the generated global header block first');
  for(const line of lines.slice(1)) {
    if(line && !/^\s/.test(line)) break;
    const match=line.match(/^ {2}([^:]+):\s*(.+)$/);
    if(match) headers[match[1]]=match[2];
  }
  for(const key of ['Content-Security-Policy','X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy']) assert.ok(headers[key],`Edge policy requires ${key}`);
  Object.assign(headers,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex','X-ElectroTutor-Route-Guard':'v1'});
  return `const BODY=${JSON.stringify(html)},HEADERS=${JSON.stringify(headers)};\nexport default {fetch(request){return new Response(request.method==='HEAD'?null:BODY,{status:404,headers:HEADERS});}};\n`;
}

export async function assertEdge404(root,base='/',expectedHeaders) {
  const [worker,html,headers,routes]=await Promise.all(['_worker.js','404.html','_headers','_routes.json'].map(file=>readFile(join(root,file),'utf8')));
  if(expectedHeaders!==undefined) assert.equal(headers,expectedHeaders,'Edge policy must use the validated generated headers');
  assert.equal(worker,edgeWorkerSource({html,headers}),'_worker.js must exactly match trusted edge policy');
  assert.deepEqual(JSON.parse(routes),edgeRoutes(base),'_routes.json must exactly match trusted route policy');
}
