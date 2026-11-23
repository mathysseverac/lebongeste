#!/usr/bin/env python3
"""Génère une page HTML par adresse du site (catalogue.html, faq.html…) à partir de index.html.

Pourquoi : le site est une seule page qui change de contenu en JavaScript. Sans ces fichiers,
Google reçoit d'abord le titre et la description de l'accueil sur toutes les adresses.
Chaque fichier généré a son propre titre, sa description, son adresse canonique et la bonne
section affichée dès le chargement. Le reste du site fonctionne exactement pareil.

À relancer après chaque modification de index.html ou des titres dans assets/app.js :
    python3 outils/generer-pages.py
"""
import html, re, pathlib

RACINE = pathlib.Path(__file__).resolve().parent.parent
index = (RACINE / 'index.html').read_text(encoding='utf-8')
app = (RACINE / 'assets/app.js').read_text(encoding='utf-8')

bloc = app[app.index('const PAGES = {'):app.index('};', app.index('const PAGES = {'))]
pages = {}
for m in re.finditer(r"'([\w-]+)':\s*\{(.*?)\n    \}", bloc, re.S):
    pid, corps = m.group(1), m.group(2)
    get = lambda k: (re.search(k + r':\s*(["\'])(.*?)(?<!\\)\1', corps, re.S) or [None, None, None])[2]
    pages[pid] = {'url': get('url'), 'title': get('title'), 'description': get('description'),
                  'noindex': 'noindex: true' in corps}

def attr(t):
    return html.escape(t.replace("\\'", "'"), quote=False).replace('"', '&quot;')

def remplace(s, motif, nouveau, n=1):
    s2, k = re.subn(motif, nouveau, s, count=0)
    assert k == n, (motif, k)
    return s2

faits = []
for pid, p in pages.items():
    if pid in ('accueil', '404'):
        continue
    nom = p['url'].rstrip('/').rsplit('/', 1)[1]
    s = index
    t, d, u = attr(p['title']), attr(p['description']), p['url']
    s = remplace(s, r'<title id="page-title">[^<]*</title>', f'<title id="page-title">{t}</title>')
    s = remplace(s, r'(<meta name="description" id="page-description" content=")[^"]*', r'\g<1>' + d)
    s = remplace(s, r'(<link rel="canonical" id="page-canonical" href=")[^"]*', r'\g<1>' + u)
    s = remplace(s, r'(<meta property="og:title" id="og-title" content=")[^"]*', r'\g<1>' + t)
    s = remplace(s, r'(<meta property="og:description" id="og-description" content=")[^"]*', r'\g<1>' + d)
    s = remplace(s, r'(<meta property="og:url" id="og-url" content=")[^"]*', r'\g<1>' + u)
    if p['noindex']:
        s = remplace(s, r'(<meta name="robots" content=")[^"]*', r'\g<1>noindex, follow')
    # section affichée au chargement
    s = remplace(s, r'(<section id="page-accueil" class="page-view) active-page', r'\1')
    s = remplace(s, r'(<section id="page-' + re.escape(pid) + r'" class="page-view)', r'\1 active-page')
    # lien actif du menu
    s = s.replace(' active-link', '')
    s = re.sub(r'(<a [^>]*data-nav="' + re.escape(pid) + r'"[^>]*class="(?:nav-link|mobile-link)[^"]*)"',
               r'\1 active-link"', s)
    (RACINE / f'{nom}.html').write_text(s, encoding='utf-8')
    faits.append(f'{nom}.html')
print('Pages générées :', ', '.join(faits))
