// Contenu publié depuis l'appli, lu par le site : chantiers, absence, photos remplacées.
// Sans base configurée, renvoie un contenu vide et le site reste tel quel.
import { configure, prepare, json, lireReglage, PRESTATIONS } from '../_lib/base.js';

export async function lireContenu(env) {
  const vide = { chantiers: [], absence: null, emplacements: {} };
  if (!configure(env)) return vide;
  await prepare(env);
  const { results } = await env.DB.prepare('SELECT id, titre, commune, texte, prestation, avant, apres, cree FROM chantiers WHERE publie = 1 ORDER BY cree DESC LIMIT 60').all();
  const absence = await lireReglage(env, 'absence', null);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const absenceActive = absence && absence.actif && (!absence.jusqu || absence.jusqu >= aujourdhui) ? absence : null;
  return {
    chantiers: results.map((c) => ({ ...c, prestationNom: PRESTATIONS[c.prestation] || '' })),
    absence: absenceActive,
    emplacements: await lireReglage(env, 'emplacements', {}),
  };
}

export async function onRequestGet({ env, request }) {
  const cache = caches.default;
  const cle = new Request(new URL('/api/contenu', request.url).toString());
  const enCache = await cache.match(cle);
  if (enCache) return enCache;
  let data;
  try { data = await lireContenu(env); } catch (e) { data = { chantiers: [], absence: null, emplacements: {} }; }
  const rep = json(data, 200, 'public, max-age=30');
  try { await cache.put(cle, rep.clone()); } catch (e) {}
  return rep;
}
