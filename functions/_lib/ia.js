// Les deux IA du blog. Les clés restent dans Cloudflare (variables secrètes), jamais dans le site.
//   PERPLEXITY_API_KEY : cherche sur le web ce que les gens se demandent (idées de sujets, faits à vérifier)
//   ANTHROPIC_API_KEY  : Claude écrit les idées et les brouillons, dans la voix de Sylvain
//   CLAUDE_MODEL       : facultatif, modèle Claude à utiliser

const MODELE = 'claude-sonnet-5-5';

export function iaPrete(env) {
  return { claude: Boolean(env.ANTHROPIC_API_KEY), perplexity: Boolean(env.PERPLEXITY_API_KEY) };
}

// Recherche web Perplexity : renvoie une liste { titre, url, extrait, date }.
export async function chercher(env, requetes, options = {}) {
  if (!env.PERPLEXITY_API_KEY) return [];
  const r = await fetch((env.PERPLEXITY_URL || 'https://api.perplexity.ai') + '/search', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.PERPLEXITY_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: requetes.slice(0, 5),
      max_results: options.max || 12,
      country: 'FR',
      search_language_filter: ['fr'],
      ...(options.recence ? { search_recency_filter: options.recence } : {}),
    }),
  });
  if (!r.ok) throw new Error('perplexity ' + r.status);
  const d = await r.json();
  return (d.results || []).map((x) => ({ titre: x.title, url: x.url, extrait: String(x.snippet || '').slice(0, 700), date: x.date || '' }));
}

// Appel à Claude avec une réponse structurée obligatoire (outil forcé).
async function claudeOutil(env, systeme, message, outil, maxTokens) {
  const r = await fetch((env.ANTHROPIC_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || MODELE,
      max_tokens: maxTokens,
      system: systeme,
      tools: [outil],
      tool_choice: { type: 'tool', name: outil.name },
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error.message; } catch (e) {}
    throw new Error('claude ' + r.status + ' ' + detail);
  }
  const d = await r.json();
  const bloc = (d.content || []).find((c) => c.type === 'tool_use');
  if (!bloc) throw new Error('claude sans réponse structurée');
  return bloc.input;
}

const VOIX = `Tu écris pour le blog « Conseils » du site le-bon-geste.fr, au nom de Sylvain.
Sylvain est jardinier et homme toutes mains à Mazamet et Aiguefonde (Tarn), dans un rayon de 20 km.
Il taille les haies, tond, débroussaille, nettoie les terrasses et allées, fait du petit bricolage et de l'assistance informatique à domicile.
Ce n'est pas un paysagiste : pas de création de jardin, pas de plantation, pas de maçonnerie.
Ses clients sont surtout des retraités. Il passe par la coopérative Unipros : le client ne paie que 50 % de la facture (crédit d'impôt des services à la personne déduit tout de suite).

Façon d'écrire :
- à la première personne (« je »), au vouvoiement pour le lecteur, ton simple et chaleureux d'artisan, phrases courtes et claires ;
- concret : ce qu'il voit sur ses chantiers, ce que le lecteur peut faire lui-même, à quel moment, avec quel outil ;
- jamais de tiret cadratin ni de tiret demi-cadratin, jamais de point médian ;
- pas de question rhétorique suivie de sa réponse, pas de « ce n'est pas X, c'est Y », pas de listes de trois par réflexe ;
- pas de formules creuses (« dans un monde où », « il est important de noter », « en conclusion », « n'hésitez pas »), pas de mots gonflés (crucial, essentiel, incontournable, optimiser, sublimer) ;
- pas de fin « inspirante » : finir sur un point pratique.

Règles sur les faits :
- n'invente aucun chiffre, aucun prix, aucune date de loi, aucune anecdote de chantier ;
- les seuls faits extérieurs autorisés sont ceux des extraits de recherche fournis, et seulement s'ils sont clairs et cohérents entre eux ;
- si Sylvain a donné des notes, elles passent avant tout le reste et tu les reprends fidèlement ;
- ne donne jamais de tarif : Sylvain fait un devis gratuit sur place.`;

export async function proposerIdees(env, { mois, existants }) {
  const saison = mois;
  let extraits = [];
  try {
    extraits = await chercher(env, [
      `jardin que faire en ${saison}`,
      `taille haie ${saison} quand tailler`,
      `entretien jardin ${saison} conseils`,
      `questions entretien pelouse haie Tarn`,
      `débroussaillage obligation propriétaire Tarn`,
    ], { max: 15, recence: 'year' });
  } catch (e) { extraits = []; }
  const systeme = VOIX + `\n\nTa tâche : proposer des sujets d'articles qui répondent à des questions que les gens tapent vraiment sur Google ou posent à une IA, et que Sylvain peut traiter avec son métier.`;
  const message = `Nous sommes en ${saison}.
Articles déjà publiés ou en brouillon (ne pas refaire le même sujet) :
${existants.length ? existants.map((t) => '- ' + t).join('\n') : '(aucun)'}

Extraits de recherche web récents (pour savoir ce qui se cherche en ce moment) :
${extraits.map((x, i) => `[${i + 1}] ${x.titre}\n${x.extrait}`).join('\n\n') || '(aucun)'}

Propose 6 sujets variés, de saison, liés aux prestations de Sylvain, formulés comme la question que se pose un particulier autour de Mazamet. Le titre doit être court, clair, sans deux-points.`;
  const r = await claudeOutil(env, systeme, message, {
    name: 'idees',
    description: 'Liste de sujets d’articles proposés à Sylvain',
    input_schema: {
      type: 'object',
      properties: {
        idees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titre: { type: 'string', description: 'Titre de l’article, 50 à 70 caractères' },
              pourquoi: { type: 'string', description: 'Une phrase simple pour Sylvain : pourquoi ce sujet intéresse les gens maintenant' },
            },
            required: ['titre', 'pourquoi'],
          },
        },
      },
      required: ['idees'],
    },
  }, 1500);
  return (r.idees || []).slice(0, 8);
}

export async function redigerArticle(env, { sujet, notes, mois }) {
  let extraits = [];
  try { extraits = await chercher(env, [sujet, sujet + ' conseils jardinier'], { max: 8 }); } catch (e) { extraits = []; }
  const message = `Sujet demandé par Sylvain : ${sujet}
Nous sommes en ${mois}.

Notes de Sylvain (à reprendre en priorité, avec ses mots si possible) :
${notes ? notes : '(pas de notes)'}

Extraits de recherche web (seule source de faits extérieurs autorisée, à n'utiliser que si c'est fiable et utile) :
${extraits.map((x, i) => `[${i + 1}] ${x.titre} (${x.url})\n${x.extrait}`).join('\n\n') || '(aucun)'}

Écris l'article :
- 600 à 900 mots ;
- les deux ou trois premières phrases répondent directement à la question, sans détour ;
- 3 à 5 intertitres écrits « ## Intertitre », formulés simplement ;
- paragraphes courts ; une liste « - » seulement si elle aide vraiment ;
- cite Mazamet ou les communes voisines une ou deux fois, naturellement, pas plus ;
- termine par un paragraphe pratique ; ne parle d'Unipros et des 50 % qu'une fois, en une phrase, seulement si ça a un rapport ;
- pas de titre « # » dans le corps.`;
  const r = await claudeOutil(env, VOIX, message, {
    name: 'article',
    description: 'Brouillon d’article prêt à relire',
    input_schema: {
      type: 'object',
      properties: {
        titre: { type: 'string', description: 'Titre de 50 à 70 caractères, clair, qui reprend la question' },
        description: { type: 'string', description: 'Résumé de 140 à 160 caractères pour Google, qui donne envie de lire' },
        adresse: { type: 'string', description: 'Adresse courte de l’article : minuscules, mots séparés par des tirets, sans accents, 3 à 7 mots' },
        corps: { type: 'string', description: 'Le texte de l’article : paragraphes séparés par une ligne vide, intertitres « ## », listes « - »' },
      },
      required: ['titre', 'description', 'adresse', 'corps'],
    },
  }, 4000);
  return r;
}

// Nettoyage final : on retire les tirets longs que l'IA laisserait passer.
export function nettoyer(t) {
  return String(t || '').replace(/\s*[—–]\s*/g, ', ').replace(/ ,/g, ',').replace(/·/g, ',');
}
