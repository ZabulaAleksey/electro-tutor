import {it,expect} from 'vitest';
import {runInNewContext} from 'node:vm';
import {workerSource} from './mvp-worker.mjs';
it('subpath upgrade removes owned hidden entries but keeps other apps, other scopes and unrelated project namespaces',async()=>{
 const origin='https://example.test',scope=origin+'/et/',current='potential-pwa-mvp-%2Fet%2F-new';
 const data=new Map([
  ['potential-pwa-v2',new Set([origin+'/et/uk/',origin+'/et/ru/topics/',origin+'/outside/unique'])],
  ['potential-pwa-mvp-%2Fet%2F-old',new Set([origin+'/et/ru/'])],
  ['potential-pwa-mvp-%2Fother%2F-old',new Set([origin+'/other/ru/'])],
  ['potential-pwa-user-work',new Set([origin+'/et/unique'])],
  ['unrelated-user-data',new Set([origin+'/et/unique'])],
  [current,new Set([origin+'/et/ru/'])],
 ]),handlers=new Map();let claimed=false;
 const caches={keys:async()=>[...data.keys()],open:async name=>({keys:async()=>[...data.get(name)].map(url=>({url})),delete:async req=>data.get(name).delete(req.url)}),delete:async name=>data.delete(name)};
 runInNewContext(workerSource({pages:['/et/ru/'],assets:[],fingerprint:'new'}),{URL,Response,caches,self:{registration:{scope},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>handlers.set(name,fn)}});
 const pending=[];handlers.get('activate')({waitUntil:promise=>pending.push(promise)});await Promise.all(pending);
 expect([...data.get('potential-pwa-v2')]).toEqual([origin+'/outside/unique']);expect(data.has('potential-pwa-mvp-%2Fet%2F-old')).toBe(false);
 for(const name of ['potential-pwa-mvp-%2Fother%2F-old','potential-pwa-user-work','unrelated-user-data',current])expect(data.has(name)).toBe(true);
 expect(claimed).toBe(true);
});
