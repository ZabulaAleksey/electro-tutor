import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicRoutes, publicPath} from './public-mvp-contract.mjs';

export function releaseOrigin(value) {
  assert.ok(value, 'SITE_URL is required for release verification');
  const u=new URL(value);
  assert.ok(u.protocol==='https:' && !u.username && !u.password && u.pathname==='/' && !u.search && !u.hash, 'SITE_URL must be a bare HTTPS origin');
  assert.ok(!/(^|\.)(localhost|example|invalid|test)$/.test(u.hostname) && !u.hostname.endsWith('.example') && !/^(?:\d+\.){3}\d+$/.test(u.hostname) && !u.hostname.includes(':'), 'SITE_URL must be a public non-placeholder hostname');
  assert.ok(!/(^|\.)example\.(com|net|org)$/.test(u.hostname), 'IANA example domains are not release origins');
  assert.equal(u.port,'','Release uses standard HTTPS');
  return u.origin;
}

export function inlineHashes(documents) {
  const hashes=new Set();
  for(const html of documents) for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if(!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  return [...hashes].sort();
}

export function assertPublicText(source,name) {
  assert.ok(!name.endsWith('.map'), `${name}: source maps are not release assets`);
  assert.doesNotMatch(source,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}/,`${name}: credential pattern`);
  assert.doesNotMatch(source,/(?:[A-Za-z]:[\\/](?:Users|DEV)[\\/]|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/)/,`${name}: absolute local path`);
  assert.doesNotMatch(source,/ET_KEYCLOAK_ADMIN_PASSWORD|ET_DATABASE_URL|ET_MIGRATION_DATABASE_URL|\/api\/v1\//,`${name}: private subsystem`);
}

export async function filesUnder(root) {
  const out=[];
  async function walk(dir) {for(const item of await readdir(dir,{withFileTypes:true})) {const p=join(dir,item.name);if(item.isDirectory())await walk(p);else out.push(relative(root,p).replaceAll('\\','/'));}}
  await walk(root);return out.sort();
}

export function securityHeaders(documents,base='/') {
  const csp=["default-src 'self'","base-uri 'none'","object-src 'none'","frame-ancestors 'none'","form-action 'none'",`script-src 'self' ${inlineHashes(documents).join(' ')}`,"script-src-attr 'none'","style-src 'self' 'unsafe-inline'","img-src 'self' data:","font-src 'self' data:","connect-src 'self'","worker-src 'self'","manifest-src 'self'","frame-src 'none'","media-src 'none'"].join('; ');
  assert.ok(csp.length<1900,'Pages header line limit: review inline script count');
  const lines=['/*',`  Content-Security-Policy: ${csp}`,'  X-Content-Type-Options: nosniff','  X-Frame-Options: DENY','  Referrer-Policy: strict-origin-when-cross-origin','  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'];
  const paths=['/',...publicRoutes].flatMap(p=>[publicPath(p,base),publicPath(p,base)+'index.html']);
  for(const p of [...new Set([...paths,...['sw.js','manifest.webmanifest','404.html','offline.html','robots.txt','sitemap-index.xml','sitemap-0.xml'].map(p=>publicPath('/'+p,base))])])lines.push(p,'  Cache-Control: no-cache');
  lines.push(publicPath('/mvp-build.json',base),'  Cache-Control: no-store',publicPath('/_astro/*',base),'  Cache-Control: public, max-age=31536000, immutable');
  return lines.join('\n')+'\n';
}

export function releaseHeadersIntegration(base) {
  return {name:'electrotutor-static-release-policy',hooks:{'astro:build:done':async({dir})=>{
    const root=fileURLToPath(dir),files=await filesUnder(root);
    const html=await Promise.all(files.filter(f=>f.endsWith('.html')).map(f=>readFile(join(root,f),'utf8')));
    await writeFile(join(root,'_headers'),securityHeaders(html,base));
  }}};
}
