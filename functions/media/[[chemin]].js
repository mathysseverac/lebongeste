// Sert les photos envoyées depuis l'appli : /media/<nom>-<taille>
// Une photo ne change jamais de nom, on peut donc la garder longtemps en cache.
export async function onRequestGet({ params, env, request }) {
  if (!env.PHOTOS) return new Response('Introuvable', { status: 404 });
  const cle = (params.chemin || []).join('/');
  if (!/^[a-z0-9-]+-(l|m|s)$/.test(cle)) return new Response('Introuvable', { status: 404 });

  const cache = caches.default;
  const enCache = await cache.match(request);
  if (enCache) return enCache;

  const objet = await env.PHOTOS.getWithMetadata(cle, { type: 'arrayBuffer' });
  if (!objet || !objet.value) return new Response('Introuvable', { status: 404 });
  const type = (objet.metadata && objet.metadata.type) || 'image/jpeg';
  const rep = new Response(objet.value, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
  try { await cache.put(request, rep.clone()); } catch (e) {}
  return rep;
}
