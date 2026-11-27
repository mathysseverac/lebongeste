// Base de données (Cloudflare D1, liaison « DB ») et photos (Cloudflare KV, liaison « PHOTOS »).
// Les tables se créent toutes seules au premier usage : rien à taper à la main.

let pret = false;

export function configure(env) {
  return Boolean(env.DB && env.PHOTOS);
}

export async function prepare(env) {
  if (pret) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS chantiers (
      id TEXT PRIMARY KEY,
      titre TEXT NOT NULL,
      commune TEXT,
      texte TEXT,
      prestation TEXT,
      avant TEXT,
      apres TEXT,
      cree INTEGER NOT NULL,
      publie INTEGER NOT NULL DEFAULT 1
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      titre TEXT NOT NULL,
      description TEXT,
      corps TEXT,
      photo TEXT,
      photo_alt TEXT,
      sujet TEXT,
      statut TEXT NOT NULL DEFAULT 'brouillon',
      cree INTEGER NOT NULL,
      maj INTEGER,
      publie_le INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS reglages (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    )`),
  ]);
  // colonne ajoutée après coup : orientation de la photo (1 = en hauteur)
  try { await env.DB.prepare('ALTER TABLE chantiers ADD COLUMN portrait INTEGER NOT NULL DEFAULT 0').run(); } catch (e) {}
  pret = true;
}

export function json(data, statut = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

export async function lireReglage(env, cle, defaut) {
  const ligne = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind(cle).first();
  if (!ligne) return defaut;
  try { return JSON.parse(ligne.valeur); } catch (e) { return defaut; }
}

export async function ecrireReglage(env, cle, valeur) {
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .bind(cle, JSON.stringify(valeur)).run();
}

export const PRESTATIONS = {
  haies: 'Taille de haies',
  tonte: 'Tonte et débroussaillage',
  terrasses: 'Terrasses et allées',
  bricolage: 'Petit bricolage',
  informatique: 'Informatique',
  autre: 'Autre',
};

// Supprime les photos d'un chantier ou d'un emplacement (toutes les tailles).
export async function supprimerPhoto(env, base) {
  if (!base || !base.startsWith('/media/')) return;
  const cle = base.slice('/media/'.length);
  await Promise.all(['l', 'm', 's'].map((t) => env.PHOTOS.delete(cle + '-' + t)));
}
