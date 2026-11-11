import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { mvpMode } from './public-mvp-contract.mjs';
const environment={...loadEnv('production',process.cwd(),''),...process.env};
environment.PUBLIC_EDUCATION_MODE=String(process.argv.includes("--education"));
environment.PUBLIC_MVP_MODE=String(process.argv.includes("--full") || process.argv.includes("--education") ? false : process.argv.includes("--mvp") ? true : mvpMode(environment.PUBLIC_MVP_MODE,true));
async function run(file,args=[]) {
 const child=spawn(process.execPath,[resolve(file),...args],{env:environment,stdio:'inherit'});
 const [code]=await once(child,'exit');if(code!==0)throw new Error(`${file}: exit ${code}`);
}
await run('scripts/transient-wasm.mjs',['check']);
await run('scripts/validate-locales.mjs');
await run('node_modules/astro/bin/astro.mjs',['build']);
if(environment.PUBLIC_MVP_MODE==='true') await run('scripts/audit-built-mvp.mjs');
else { await run('scripts/audit-built-locales.mjs');await run('scripts/audit-built-lessons.mjs'); }
await run('scripts/audit-built-site.mjs');
if (environment.PUBLIC_EDUCATION_MODE === 'true') await run('scripts/education-release.mjs');
