// API de l'appli de gestion (espace admin). Tout passe par ici.
// Protégée deux fois : Cloudflare Access devant, et la vérification du jeton ci-dessous.
import { utilisateur } from '../../_lib/acces.js';
import { iaPrete, proposerIdees, redigerArticle, nettoyer } from '../../_lib/ia.js';
import { configure, prepare, json, lireReglage, ecrireReglage, PRESTATIONS, supprimerPhoto } from '../../_lib/base.js';

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo par fichier, largement assez après redimensionnement
const TYPES = ['image/webp', 'image/jpeg'];

function id() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + '-' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function texte(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function adresseWeb(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'conseil';
}

async function adresseLibre(env, voulue, sauf) {
  let s = adresseWeb(voulue), n = 2;
  while (await env.DB.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').bind(s, sauf || '').first()) s = adresseWeb(voulue) + '-' + n++;
  return s;
}

function moisActuel() {
  const m = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = new Date();
  return m[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function base(v) {
  v = String(v || '');
  return /^\/media\/[a-z0-9-]+$/.test(v) ? v : '';
}

async function viderCache(request) {
  const cache = caches.default;
  const o = new URL(request.url).origin;
  await Promise.all(['/api/contenu'].map((p) => cache.delete(new Request(o + p)).catch(() => {})));
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const qui = await utilisateur(request, env);
  if (!qui) return json({ erreur: 'Accès refusé. Reconnecte-toi.' }, 401);
  if (!configure(env)) return json({ erreur: 'L’appli n’est pas encore branchée (base ou photos manquantes dans Cloudflare).' }, 503);

  // Les modifications doivent venir de l'appli elle-même.
  if (request.method !== 'GET') {
    const origine = request.headers.get('Origin');
    if (origine && origine !== new URL(request.url).origin) return json({ erreur: 'Origine refusée' }, 403);
    if (request.headers.get('X-LBG') !== '1') return json({ erreur: 'Requête refusée' }, 403);
  }

  await prepare(env);
  const chemin = (params.chemin || []);
  const [ressource, cle] = chemin;
  const methode = request.method;

  try {
    if (ressource === 'moi' && methode === 'GET') {
      return json({ email: qui.email, prestations: PRESTATIONS });
    }

    // ---------- chantiers ----------
    if (ressource === 'chantiers') {
      if (methode === 'GET' && !cle) {
        const { results } = await env.DB.prepare('SELECT * FROM chantiers ORDER BY cree DESC').all();
        return json({ chantiers: results });
      }
      if (methode === 'POST' && !cle) {
        const d = await request.json();
        const c = {
          id: id(),
          titre: texte(d.titre, 120),
          commune: texte(d.commune, 60),
          texte: texte(d.texte, 600),
          prestation: PRESTATIONS[d.prestation] ? d.prestation : 'autre',
          avant: base(d.avant),
          apres: base(d.apres),
          portrait: d.portrait ? 1 : 0,
        };
        if (!c.titre) return json({ erreur: 'Il manque un titre.' }, 400);
        if (!c.apres) return json({ erreur: 'Il manque la photo « après ».' }, 400);
        await env.DB.prepare('INSERT INTO chantiers (id, titre, commune, texte, prestation, avant, apres, portrait, cree, publie) VALUES (?,?,?,?,?,?,?,?,?,1)')
          .bind(c.id, c.titre, c.commune, c.texte, c.prestation, c.avant, c.apres, c.portrait, Date.now()).run();
        await viderCache(request);
        return json({ ok: true, id: c.id });
      }
      if (methode === 'PATCH' && cle) {
        const d = await request.json();
        const actuel = await env.DB.prepare('SELECT * FROM chantiers WHERE id = ?').bind(cle).first();
        if (!actuel) return json({ erreur: 'Chantier introuvable.' }, 404);
        const n = {
          titre: d.titre != null ? texte(d.titre, 120) : actuel.titre,
          commune: d.commune != null ? texte(d.commune, 60) : actuel.commune,
          texte: d.texte != null ? texte(d.texte, 600) : actuel.texte,
          prestation: d.prestation && PRESTATIONS[d.prestation] ? d.prestation : actuel.prestation,
          publie: d.publie != null ? (d.publie ? 1 : 0) : actuel.publie,
          // photos : absente = on garde, chaîne vide = on retire la photo avant
          avant: d.avant != null ? base(d.avant) : actuel.avant,
          apres: d.apres != null && base(d.apres) ? base(d.apres) : actuel.apres,
          portrait: d.portrait != null ? (d.portrait ? 1 : 0) : actuel.portrait,
        };
        if (!n.titre) return json({ erreur: 'Il manque un titre.' }, 400);
        await env.DB.prepare('UPDATE chantiers SET titre=?, commune=?, texte=?, prestation=?, publie=?, avant=?, apres=?, portrait=? WHERE id=?')
          .bind(n.titre, n.commune, n.texte, n.prestation, n.publie, n.avant, n.apres, n.portrait, cle).run();
        if (actuel.avant && actuel.avant !== n.avant) await supprimerPhoto(env, actuel.avant);
        if (actuel.apres && actuel.apres !== n.apres) await supprimerPhoto(env, actuel.apres);
        await viderCache(request);
        return json({ ok: true });
      }
      if (methode === 'DELETE' && cle) {
        const actuel = await env.DB.prepare('SELECT * FROM chantiers WHERE id = ?').bind(cle).first();
        if (!actuel) return json({ erreur: 'Chantier introuvable.' }, 404);
        await env.DB.prepare('DELETE FROM chantiers WHERE id = ?').bind(cle).run();
        await supprimerPhoto(env, actuel.avant);
        await supprimerPhoto(env, actuel.apres);
        await viderCache(request);
        return json({ ok: true });
      }
    }

    // ---------- envoi d'une photo (3 tailles déjà préparées par le téléphone) ----------
    if (ressource === 'photo' && methode === 'POST') {
      const form = await request.formData();
      const nom = id();
      const fichiers = {};
      for (const t of ['l', 'm', 's']) {
        const f = form.get(t);
        if (!f || typeof f === 'string') return json({ erreur: 'Photo incomplète.' }, 400);
        if (!TYPES.includes(f.type)) return json({ erreur: 'Format de photo non accepté.' }, 400);
        if (f.size > TAILLE_MAX) return json({ erreur: 'Photo trop lourde.' }, 400);
        fichiers[t] = f;
      }
      for (const t of ['l', 'm', 's']) {
        await env.PHOTOS.put(nom + '-' + t, await fichiers[t].arrayBuffer(), { metadata: { type: fichiers[t].type } });
      }
      return json({ ok: true, base: '/media/' + nom });
    }

    // ---------- réglages : absence et photos du site ----------
    if (ressource === 'reglages' && methode === 'GET') {
      return json({
        absence: await lireReglage(env, 'absence', { actif: false, jusqu: '', message: '' }),
        emplacements: await lireReglage(env, 'emplacements', {}),
        textes: await lireReglage(env, 'textes', {}),
        contact: await lireReglage(env, 'contact', {}),
        caches: await lireReglage(env, 'caches', {}),
      });
    }
    if (ressource === 'absence' && methode === 'PUT') {
      const d = await request.json();
      const jusqu = /^\d{4}-\d{2}-\d{2}$/.test(d.jusqu || '') ? d.jusqu : '';
      const absence = { actif: Boolean(d.actif), jusqu, message: texte(d.message, 240) };
      await ecrireReglage(env, 'absence', absence);
      await viderCache(request);
      return json({ ok: true, absence });
    }
    if (ressource === 'emplacement' && methode === 'PUT') {
      const d = await request.json();
      if (!/^[a-z0-9-]{1,60}$/.test(String(d.cle || ''))) return json({ erreur: 'Emplacement inconnu.' }, 400);
      const tous = await lireReglage(env, 'emplacements', {});
      const ancien = tous[d.cle];
      const nouveau = base(d.base);
      if (nouveau) tous[d.cle] = nouveau; else delete tous[d.cle];
      await ecrireReglage(env, 'emplacements', tous);
      if (ancien && ancien !== nouveau) await supprimerPhoto(env, ancien);
      await viderCache(request);
      return json({ ok: true, emplacements: tous });
    }

    // ---------- textes du site ----------
    if (ressource === 'texte' && methode === 'PUT') {
      const d = await request.json();
      if (!/^t\d{1,5}$/.test(String(d.cle || ''))) return json({ erreur: 'Texte inconnu.' }, 400);
      const tous = await lireReglage(env, 'textes', {});
      const t = texte(d.texte, 2000);
      if (d.texte == null || d.origine) delete tous[d.cle];
      else if (!t) return json({ erreur: 'Le texte est vide. Pour revenir au texte d’origine, utilise le bouton prévu.' }, 400);
      else tous[d.cle] = t;
      await ecrireReglage(env, 'textes', tous);
      await viderCache(request);
      return json({ ok: true });
    }

    // ---------- coordonnées ----------
    if (ressource === 'contact' && methode === 'PUT') {
      const d = await request.json();
      const tel = String(d.tel || '').replace(/[^\d+]/g, '').replace(/^\+33/, '0');
      const mail = texte(d.mail, 120).toLowerCase();
      if (tel && !/^0[1-9]\d{8}$/.test(tel)) return json({ erreur: 'Le numéro doit avoir 10 chiffres, par exemple 06 12 34 56 78.' }, 400);
      if (mail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(mail)) return json({ erreur: 'L’adresse mail ne semble pas complète.' }, 400);
      const contact = {};
      if (tel) contact.tel = tel;
      if (mail) contact.mail = mail;
      await ecrireReglage(env, 'contact', contact);
      await viderCache(request);
      return json({ ok: true, contact });
    }

    // ---------- anciens chantiers de la page Réalisations : afficher ou cacher ----------
    if (ressource === 'bloc' && methode === 'PUT') {
      const d = await request.json();
      if (!/^[a-z0-9-]{1,60}$/.test(String(d.cle || ''))) return json({ erreur: 'Bloc inconnu.' }, 400);
      const tous = await lireReglage(env, 'caches', {});
      if (d.visible) delete tous[d.cle]; else tous[d.cle] = true;
      await ecrireReglage(env, 'caches', tous);
      await viderCache(request);
      return json({ ok: true });
    }

    // ---------- blog « Conseils » ----------
    if (ressource === 'blog') {
      const sous = chemin[1];
      if (methode === 'GET' && !sous) {
        const { results } = await env.DB.prepare('SELECT id, slug, titre, description, photo, statut, cree, maj, publie_le FROM articles ORDER BY cree DESC').all();
        return json({ ia: iaPrete(env), articles: results });
      }
      if (methode === 'POST' && sous === 'idees') {
        if (!env.ANTHROPIC_API_KEY) return json({ erreur: 'La clé Claude n’est pas encore ajoutée dans Cloudflare.' }, 503);
        if (!env.PERPLEXITY_API_KEY) return json({ erreur: 'La clé Perplexity n’est pas encore ajoutée dans Cloudflare. Tu peux quand même écrire ton idée toi-même.' }, 503);
        const { results } = await env.DB.prepare('SELECT titre FROM articles ORDER BY cree DESC LIMIT 40').all();
        try {
          const idees = await proposerIdees(env, { mois: moisActuel(), existants: results.map((r) => r.titre) });
          return json({ idees: idees.map((i) => ({ titre: nettoyer(i.titre), pourquoi: nettoyer(i.pourquoi) })) });
        } catch (e) {
          return json({ erreur: 'Les idées n’ont pas pu être trouvées. Réessaie dans une minute.', detail: String(e.message || e).slice(0, 200) }, 502);
        }
      }
      if (methode === 'POST' && sous === 'rediger') {
        if (!env.ANTHROPIC_API_KEY) return json({ erreur: 'La clé Claude n’est pas encore ajoutée dans Cloudflare.' }, 503);
        const d = await request.json();
        const sujet = texte(d.sujet, 200);
        if (!sujet) return json({ erreur: 'Choisis une idée ou écris ton sujet.' }, 400);
        const notes = String(d.notes || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 3000);
        let r;
        try { r = await redigerArticle(env, { sujet, notes, mois: moisActuel() }); }
        catch (e) { return json({ erreur: 'Le brouillon n’a pas pu être écrit. Réessaie dans une minute.', detail: String(e.message || e).slice(0, 200) }, 502); }
        const a = {
          id: id(),
          titre: texte(nettoyer(r.titre), 120) || sujet,
          description: texte(nettoyer(r.description), 200),
          corps: nettoyer(r.corps).slice(0, 20000),
          photo: base(d.photo),
          photo_alt: texte(d.photo_alt, 200),
        };
        a.slug = await adresseLibre(env, r.adresse || a.titre);
        await env.DB.prepare("INSERT INTO articles (id, slug, titre, description, corps, photo, photo_alt, sujet, statut, cree, maj) VALUES (?,?,?,?,?,?,?,?,'brouillon',?,?)")
          .bind(a.id, a.slug, a.titre, a.description, a.corps, a.photo, a.photo_alt, sujet, Date.now(), Date.now()).run();
        return json({ ok: true, id: a.id });
      }
      if (sous) {
        const actuel = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(sous).first();
        if (!actuel) return json({ erreur: 'Article introuvable.' }, 404);
        if (methode === 'GET') return json({ article: actuel });
        if (methode === 'PATCH') {
          const d = await request.json();
          const n = {
            titre: d.titre != null ? texte(d.titre, 120) : actuel.titre,
            description: d.description != null ? texte(d.description, 200) : actuel.description,
            corps: d.corps != null ? String(d.corps).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, 20000) : actuel.corps,
            photo: d.photo != null ? base(d.photo) : actuel.photo,
            photo_alt: d.photo_alt != null ? texte(d.photo_alt, 200) : actuel.photo_alt,
            statut: d.statut === 'publie' || d.statut === 'brouillon' ? d.statut : actuel.statut,
          };
          if (!n.titre) return json({ erreur: 'Il manque un titre.' }, 400);
          if (n.statut === 'publie' && !n.corps.trim()) return json({ erreur: 'L’article est vide.' }, 400);
          // Tant que l'article n'a jamais été publié, son adresse suit le titre.
          const slug = actuel.publie_le || n.titre === actuel.titre ? actuel.slug : await adresseLibre(env, n.titre, actuel.id);
          const publieLe = n.statut === 'publie' ? (actuel.publie_le || Date.now()) : actuel.publie_le;
          await env.DB.prepare('UPDATE articles SET titre=?, description=?, corps=?, photo=?, photo_alt=?, statut=?, slug=?, maj=?, publie_le=? WHERE id=?')
            .bind(n.titre, n.description, n.corps, n.photo, n.photo_alt, n.statut, slug, Date.now(), publieLe, actuel.id).run();
          if (actuel.photo && actuel.photo !== n.photo) await supprimerPhoto(env, actuel.photo);
          await viderCache(request);
          return json({ ok: true, slug, statut: n.statut });
        }
        if (methode === 'DELETE') {
          await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(actuel.id).run();
          await supprimerPhoto(env, actuel.photo);
          await viderCache(request);
          return json({ ok: true });
        }
      }
    }

    return json({ erreur: 'Action inconnue.' }, 404);
  } catch (e) {
    return json({ erreur: 'Erreur du serveur. Réessaie dans un instant.' }, 500);
  }
}
