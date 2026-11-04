import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {releaseOrigin,filesUnder,assertPublicText,securityHeaders} from './release-policy.mjs';
import {publicRoutes,publicPath} from './public-mvp-contract.mjs';
import {assertRetiredRoutes} from './mvp-retired-routes.mjs';
import {assertEdge404} from './mvp-edge-404.mjs';

export async function auditRelease({root,site,base='/'}) {
  const origin=releaseOrigin(site);
  const files=await filesUnder(root),documents=[];
  assert.ok(!files.some(f=>f.endsWith('.map')||(f.startsWith('_worker')&&f!=='_worker.js')||f.startsWith('functions/')),'Static release must have no source maps/Functions/worker backend');
  for(const file of files.filter(f=>/\.(html|js|json|css|svg|webmanifest|xml|txt)$/.test(f))) {
    const source=await readFile(join(root,file),'utf8');assertPublicText(source,file);
    if(file.endsWith('.html'))documents.push(source);
  }
  const headers=await readFile(join(root,'_headers'),'utf8');assert.equal(headers,securityHeaders(documents,base),'Headers must match actual script hashes and current route graph');
  await assertRetiredRoutes(root,base);
  await assertEdge404(root,base,headers);
  const titles=new Set();
  for(const route of publicRoutes) {
    const source=await readFile(join(root,route.slice(1),'index.html'),'utf8'),url=origin+publicPath(route,base);
    assert.ok(source.includes(`rel="canonical" href="${url}"`),`${route}: canonical origin/path`);
    const title=source.match(/<title>([^<]+)<\/title>/)?.[1];assert.ok(title&&!titles.has(title),`${route}: unique title`);titles.add(title);
    assert.match(source,/<meta name="description" content="[^"]{30,}"/);
    for(const [property,value]of [['og:type','website'],['og:url',url],['og:locale','ru_RU'],['og:site_name','ElectroTutor']])assert.ok(source.includes(`property="${property}" content="${value}"`),`${route}: ${property}`);
    assert.ok(source.includes(`property="og:image" content="${origin+publicPath('/icons/potential-512.png',base)}"`));
    assert.match(source,/<meta property="og:title" content="[^"]+"/);assert.match(source,/<meta property="og:description" content="[^"]+"/);
    assert.doesNotMatch(source,/noindex|hreflang="uk"/);
  }
  const robots=await readFile(join(root,'robots.txt'),'utf8');assert.match(robots,/User-agent: \*\s+Allow: \//);assert.doesNotMatch(robots,/Disallow:|Googlebot|OAI-SearchBot/);
  assert.ok(robots.includes(`Sitemap: ${origin+publicPath('/sitemap-index.xml',base)}`));
  const sitemap=await readFile(join(root,'sitemap-0.xml'),'utf8');assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]).sort(),publicRoutes.map(p=>origin+publicPath(p,base)).sort());
  console.log(`Release audit PASS: ${origin}${base}, ${publicRoutes.length} indexable pages, hashed CSP, static/no-secret graph.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await auditRelease({root:resolve(process.env.BUILD_OUTPUT_DIR||'dist'),site:process.env.SITE_URL,base:process.env.BASE_PATH||'/'});
