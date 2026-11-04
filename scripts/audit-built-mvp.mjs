import assert from 'node:assert/strict';
import {assertPublicText} from './release-policy.mjs';
import {readdir,readFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {publicRoutes,publicPath,mvpManifest} from './public-mvp-contract.mjs';
const root=resolve(process.env.BUILD_OUTPUT_DIR||'dist'),base=process.env.BASE_PATH||'/',files=[];
async function walk(p){for(const item of await readdir(p,{withFileTypes:true})){const f=join(p,item.name);if(item.isDirectory())await walk(f);else files.push(relative(root,f).replaceAll('\\','/'));}}
await walk(root);
assert.ok(!files.some(f=>f.endsWith(".map")),"No public source maps");
const expected=['index.html','404.html','offline.html',...publicRoutes.map(p=>p.slice(1)+'index.html')].sort();
assert.deepEqual(files.filter(f=>f.endsWith('.html')).sort(),expected,'MVP must physically contain only the approved pages');
assert.deepEqual(JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8')),mvpManifest(base));
const sitemap=(await Promise.all(files.filter(f=>/^sitemap-\d+\.xml$/.test(f)).map(f=>readFile(join(root,f),'utf8')))).join('');
const paths=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname).sort();
assert.deepEqual(paths,publicRoutes.map(p=>publicPath(p,base)).sort(),'Only seven approved RU pages may be indexed');
assert.match(await readFile(join(root,'robots.txt'),'utf8'),/Sitemap: https?:\/\//);
for(const file of files.filter(f=>/\.(html|js|json|webmanifest|css|svg|xml|txt)$/.test(f))){
 const source=await readFile(join(root,file),'utf8');assertPublicText(source,file);
 assert.doesNotMatch(source,/\/api\/v1\/|\/uk\/|["'](?:https?:\/\/[^"']+)?\/ru\/(?:account|services|interactive|board|my-services|classroom)\//,`${file}: hidden/auth subsystem leaked`);
 if(file.endsWith('.html')&&!['index.html','404.html','offline.html'].includes(file)){
  assert.match(source,/<html[^>]*lang="ru"/);
  assert.doesNotMatch(source,/hreflang="uk"|fonts\.googleapis\.com/);
 }
}
for(const route of ['ru/topics/dc/mesh-current-method/','ru/topics/dc/mesh-current-method/examples/']){const html=await readFile(join(root,route,'index.html'),'utf8');assert.equal([...html.matchAll(/class="katex"/g)].length,129,route+': verified formulas retained');assert.doesNotMatch(html,/katex-error/);}
for(const file of ['404.html','offline.html'])assert.match(await readFile(join(root,file),'utf8'),/noindex/);
const worker=await readFile(join(root,'sw.js'),'utf8');assert.match(worker,/potential-pwa-mvp-/);assert.match(worker,/self.registration.scope/);assert.match(worker,/X-Robots-Tag/);
assert.deepEqual(JSON.parse(await readFile(join(root,'mvp-build.json'),'utf8')),{mode:'mvp',version:1});
console.log(`MVP artifact audit PASS: ${expected.length} HTML, seven indexable RU pages, no hidden route/auth graph, manifest/SEO/worker coherent.`);
