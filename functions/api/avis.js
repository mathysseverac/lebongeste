// Avis Google de la fiche « Le bon geste », lus avec l'API Google Places (New).
// Variables à mettre dans Cloudflare Pages (jamais dans le code) :
//   GOOGLE_PLACES_KEY  clé d'API Google, limitée à « Places API (New) »
//   GOOGLE_PLACE_ID    identifiant de la fiche (commence souvent par ChIJ)
// Sans ces variables, la route renvoie une liste vide et le site n'affiche pas le bloc d'avis.
// La réponse est gardée 12 h en cache : Google n'est appelé qu'environ deux fois par jour.

const CACHE_SECONDES = 12 * 60 * 60;

function json(data, maxAge) {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=' + maxAge,
    },
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const vide = { reviews: [], rating: null, count: 0, mapsUri: null };
  if (!env.GOOGLE_PLACES_KEY || !env.GOOGLE_PLACE_ID) return json(vide, 300);

  const cache = caches.default;
  const cleCache = new Request(new URL('/api/avis', request.url).toString(), { method: 'GET' });
  const enCache = await cache.match(cleCache);
  if (enCache) return enCache;

  let res;
  try {
    res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(env.GOOGLE_PLACE_ID) + '?languageCode=fr', {
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri',
      },
    });
  } catch (e) {
    return json(vide, 300);
  }
  if (!res.ok) return json(vide, 300);

  const place = await res.json();
  const reviews = (place.reviews || [])
    .map(function (r) {
      // Texte d'origine écrit par le client, sans traduction ni retouche.
      const texte = (r.originalText && r.originalText.text) || (r.text && r.text.text) || '';
      const auteur = r.authorAttribution || {};
      return {
        author: auteur.displayName || 'Client Google',
        authorUri: auteur.uri || null,
        photo: auteur.photoUri || null,
        rating: r.rating || null,
        relativeTime: r.relativePublishTimeDescription || '',
        publishTime: r.publishTime || null,
        text: texte,
        reviewUri: r.googleMapsUri || null,
      };
    })
    .filter(function (r) { return r.rating; });

  const data = {
    reviews: reviews,
    rating: place.rating || null,
    count: place.userRatingCount || 0,
    mapsUri: place.googleMapsUri || null,
  };
  const reponse = json(data, CACHE_SECONDES);
  context.waitUntil(cache.put(cleCache, reponse.clone()));
  return reponse;
}
