// Contenu publié depuis l'appli, lu par le site : chantiers, absence, photos, textes, coordonnées.
// Sans base configurée, renvoie un contenu vide et le site reste tel quel.
import { configure, prepare, json, PRESTATIONS } from '../_lib/base.js';
import { articlesPublies } from '../_lib/blog.js';

export const VIDE = { chantiers: [], absence: null, emplacements: {}, textes: {}, contact: {}, caches: {}, articles: [] };

export async function lireContenu(env) {
  if (!configure(env)) return VIDE;
  await prepare(env);
  const { results } = await env.DB.prepare('SELECT id, titre, commune, texte, prestation, avant, apres, portrait, cree FROM chantiers WHERE publie = 1 ORDER BY cree DESC LIMIT 60').all();
  const { results: reglages } = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('absence','emplacements','textes','contact','caches')").all();
  const r = {};
  for (const l of reglages) { try { r[l.cle] = JSON.parse(l.valeur); } catch (e) {} }
  const absence = r.absence;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const absenceActive = absence && absence.actif && (!absence.jusqu || absence.jusqu >= aujourdhui) ? absence : null;
  return {
    chantiers: results.map((c) => ({ ...c, prestationNom: PRESTATIONS[c.prestation] || '' })),
    absence: absenceActive,
    emplacements: r.emplacements || {},
    textes: r.textes || {},
    contact: r.contact || {},
    caches: r.caches || {},
    articles: await articlesPublies(env, 30),
  };
}

// Lu au plus une fois toutes les 30 secondes (l'appli vide ce cache à chaque modification).
export async function contenuEnCache(request, env) {
  const cache = caches.default;
  const cle = new Request(new URL('/api/contenu', request.url).toString());
  const enCache = await cache.match(cle).catch(() => null);
  if (enCache) return enCache.json();
  let data;
  try { data = await lireContenu(env); } catch (e) { return VIDE; }
  try { await cache.put(cle, json(data, 200, 'public, max-age=30')); } catch (e) {}
  return data;
}

export async function onRequestGet({ env, request }) {
  return json(await contenuEnCache(request, env), 200, 'public, max-age=30');
}
