import {test,expect} from 'vitest';
import {inlineHashes,securityHeaders,releaseOrigin,assertPublicText} from './release-policy.mjs';

test('release origin fails closed for placeholders, credentials and non-origin URLs',()=>{
  for(const value of [undefined,'http://electrotutor.pages.dev','https://your-domain.example','https://example.com','https://demo.example.org','https://localhost','https://127.0.0.1','https://electrotutor.pages.dev/a','https://u:p@electrotutor.pages.dev','https://electrotutor.pages.dev/?a=1'])expect(()=>releaseOrigin(value)).toThrow();
  expect(releaseOrigin('https://electrotutor.pages.dev/')).toBe('https://electrotutor.pages.dev');
});
test('CSP trusts exact inline bytes across navigation documents, never arbitrary inline scripts',()=>{
  const docs=['<script>console.log(1)</script><script src="/ok.js"></script>','<script>console.log(2)</script><script>console.log(1)</script>'];
  const hashes=inlineHashes(docs);expect(hashes).toHaveLength(2);expect(hashes).not.toEqual(inlineHashes(['<script>console.log(3)</script>']));
  const script=securityHeaders(docs).split('\n')[1].split(';').find(p=>p.includes('script-src '));expect(script).not.toMatch(/unsafe-inline|unsafe-eval|data:/);
  expect(securityHeaders(docs,'/electro-tutor/')).toContain('/electro-tutor/sw.js\n  Cache-Control: no-cache');
});
test('public artifact rejects high-signal credential, source map and host path leaks',()=>{
  for(const [s,n]of [['-----BEGIN PRIVATE KEY-----','page.html'],['ghp_'+'a'.repeat(36),'app.js'],['C:\\Users\\aleks\\file','app.js'],['/home/owner/project','app.js'],['ET_DATABASE_URL','app.js'],['{}','app.js.map']])expect(()=>assertPublicText(s,n)).toThrow();
  expect(()=>assertPublicText('const token="public-label"; const ns="http://www.w3.org/2000/svg";','app.js')).not.toThrow();
});
