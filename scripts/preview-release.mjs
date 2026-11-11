// Local static policy rehearsal. This is not a Cloudflare emulator or a deployment.
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,extname,sep,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export function parseHeaders(source) {
  const rules=[];let rule;
  for(const line of source.split(/\r?\n/)) {
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    if(!/^\s/.test(line)){rule={path:line,headers:{}};rules.push(rule);continue;}
    assert.ok(rule,'Header before route');const match=line.trim().match(/^([^:]+):\s*(.*)$/);assert.ok(match,'Malformed header');
    rule.headers[match[1]]=match[2];
  }
  return rules;
}
function matches(pattern,path) {return pattern.endsWith('*')?path.startsWith(pattern.slice(0,-1)):pattern===path;}
export async function createReleasePreview(root) {
  root=await realpath(root);const rules=parseHeaders(await readFile(join(root,'_headers'),'utf8'));
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
      const headers={'Cache-Control':'public, max-age=0, must-revalidate'};
      for(const rule of rules)if(matches(rule.path,path))Object.assign(headers,rule.headers);
      async function send(file,status=200) {
        const real=await realpath(file),rel=relative(root,real);assert.ok(rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep),'Outside artifact');
        const data=await readFile(real),ext=extname(real),mime={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'}[ext]||'application/octet-stream';
        res.writeHead(status,{...headers,'Content-Type':mime,...(status===404?{'X-Robots-Tag':'noindex'}:{})});res.end(req.method==='HEAD'?undefined:data);
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{...headers,Allow:'GET, HEAD'}).end();return;}
      if(path.split('/').some(p=>p.startsWith('.')||p==='_headers'||p==='_redirects')){await send(join(root,'404.html'),404);return;}
      let file=resolve(root,'.'+path);const rel=relative(root,file);if(rel.startsWith('..'+sep)||rel==='..'){await send(join(root,'404.html'),404);return;}
      try {
        if((await stat(file)).isDirectory()){
          if(!path.endsWith('/')){res.writeHead(301,{...headers,Location:path+'/'+url.search}).end();return;}
          file=join(file,'index.html');
        }
        await send(file);
      }catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')await send(join(root,'404.html'),404);else throw e;}
    }catch{if(!res.headersSent)res.writeHead(400,{'Cache-Control':'no-store'});res.end('Invalid request');}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const at=process.argv.indexOf('--port'),port=at<0?4325:Number(process.argv[at+1]);assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'Invalid loopback port');
  const server=await createReleasePreview(resolve(process.env.BUILD_OUTPUT_DIR||'dist'));
  server.listen(port,'127.0.0.1',()=>console.log(`Static release policy rehearsal: http://127.0.0.1:${port}`));
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit()));
}
