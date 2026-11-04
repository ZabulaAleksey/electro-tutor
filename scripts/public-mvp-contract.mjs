import { normalizeBasePath } from './site-contract.mjs';
export const meshRoute = '/ru/topics/dc/mesh-current-method/';
export const publicRoutes = ['/ru/',meshRoute,`${meshRoute}examples/`,`${meshRoute}lab/`,'/ru/help/','/ru/contacts/','/ru/privacy/'];
export const iconNames = ['potential.svg','potential-maskable.svg','potential-192.png','potential-512.png','potential-maskable-512.png'];
export function mvpMode(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('PUBLIC_MVP_MODE must be true or false');
}
export function publicPath(route, base = '/') { return normalizeBasePath(base).slice(0,-1) + route; }
export function isPublicPage(path, base = '/') { return ['/',...publicRoutes].some(p => publicPath(p,base) === path); }
export function mvpManifest(base = '/') {
 const path = p => publicPath(p,base);
 return {id:path('/'),name:'ElectroTutor — метод контурных токов',short_name:'ElectroTutor',description:'Учебник, примеры решений и интерактивная лаборатория метода контурных токов.',lang:'ru',start_url:path('/ru/'),scope:path('/'),display:'standalone',background_color:'#f8f9fc',theme_color:'#071328',icons:iconNames.filter(n=>n.endsWith('.png')).map(n=>({src:path('/icons/'+n),sizes:n.includes('192')?'192x192':'512x512',type:'image/png',purpose:n.includes('maskable')?'maskable':'any'})),shortcuts:publicRoutes.slice(1,4).map((p,i)=>({name:['Учебник','Примеры решений','Лаборатория'][i],url:path(p)}))};
}
