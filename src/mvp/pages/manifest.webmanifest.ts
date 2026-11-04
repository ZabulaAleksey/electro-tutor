import {mvpManifest} from "../../../scripts/public-mvp-contract.mjs";
export const GET = () => new Response(JSON.stringify(mvpManifest(import.meta.env.BASE_URL)),{headers:{"Content-Type":"application/manifest+json"}});
