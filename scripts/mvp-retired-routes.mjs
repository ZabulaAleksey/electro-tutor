import assert from 'node:assert/strict';
import {join, relative} from 'node:path';
import {readFile, readdir, lstat} from 'node:fs/promises';
import {publicPath} from './public-mvp-contract.mjs';

export const retiredTarget = '/__mvp_not_found__';
export function retiredRewrites(base = '/') {
  const path = route => publicPath(route, base);
  const target = path(retiredTarget);
  return [
    `${path('/uk')} ${target} 200`,
    `${path('/uk')}/* ${target} 200`,
    `${path('/ru/interactive')} ${target} 200`,
    `${path('/ru/interactive')}/* ${target} 200`,
  ].join('\n') + '\n';
}
export function retiredHeaderPaths(base = '/') {
  const path = route => publicPath(route, base);
  return [path('/uk'), `${path('/uk')}/*`, path('/ru/interactive'), `${path('/ru/interactive')}/*`, path(retiredTarget)];
}
export function retiredPolicy(base = '/') { return {target: publicPath(retiredTarget, base), redirects: retiredRewrites(base), headerPaths: retiredHeaderPaths(base)}; }

export async function assertRetiredRoutes(root, base = '/') {
  const target = retiredTarget.replace(/^\//, '');
  const files = [];
  async function walk(dir) { for (const item of await readdir(dir, {withFileTypes:true})) { const p=join(dir,item.name); if(item.isDirectory()) await walk(p); else files.push(relative(root,p).replaceAll('\\','/')); } }
  await walk(root);
  assert.ok(files.includes('404.html'), 'MVP release requires top-level 404.html');
  const targetPath = join(root, target);
  let targetExists = false;
  try { await lstat(targetPath); targetExists = true; } catch (error) { assert.equal(error.code, 'ENOENT'); }
  assert.ok(!targetExists, 'Retired route target directory or file must remain absent');
  assert.ok(!files.some(f => f === target || f === `${target}/index.html` || f === `${target}.html`), 'Retired route target must remain absent');
  assert.ok(!files.some(f => f === 'uk/index.html' || f.startsWith('uk/') || f === 'ru/interactive/index.html' || f.startsWith('ru/interactive/')), 'Retired route assets must remain absent');
  const redirects = await readFile(join(root, '_redirects'), 'utf8');
  assert.equal(redirects, retiredRewrites(base), 'MVP retired route redirects must match policy exactly');
}
