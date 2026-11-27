// Plan du site pour Google : le fichier sitemap.xml, plus les articles publiés du blog.
import { configure, prepare } from './_lib/base.js';
import { articlesPublies, SITE } from './_lib/blog.js';

export async function onRequestGet({ request, env }) {
  const fichier = await env.ASSETS.fetch(new URL('/sitemap-pages.xml', request.url));
  let xml = await fichier.text();
  try {
    if (configure(env)) {
      await prepare(env);
      const arts = await articlesPublies(env, 500);
      const urls = arts.map((a) => `  <url>\n    <loc>${SITE}/conseils/${a.slug}</loc>\n    <lastmod>${new Date(a.maj || a.publie_le).toISOString().slice(0, 10)}</lastmod>\n  </url>`).join('\n');
      if (urls) xml = xml.replace('</urlset>', urls + '\n</urlset>');
    }
  } catch (e) {}
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
