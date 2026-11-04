export const GET = ({site}: {site:URL}) => new Response(`User-agent: *
Allow: /
Sitemap: ${new URL(import.meta.env.BASE_URL+"sitemap-index.xml",site)}
`,{headers:{"Content-Type":"text/plain"}});
