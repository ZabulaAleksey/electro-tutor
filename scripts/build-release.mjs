import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {loadEnv} from 'vite';
import {normalizeBasePath} from './site-contract.mjs';
import {releaseOrigin} from './release-policy.mjs';
const env={...loadEnv('production',process.cwd(),''),...process.env};
env.SITE_URL=releaseOrigin(env.SITE_URL);
env.BASE_PATH=normalizeBasePath(env.BASE_PATH);
env.PUBLIC_MVP_MODE='true';
for(const script of ['scripts/build-site.mjs','scripts/audit-release.mjs']){
  const child=spawn(process.execPath,[resolve(script)],{env,stdio:'inherit'});
  const [code]=await once(child,'exit');if(code!==0)throw new Error(`${script}: exit ${code}`);
}
