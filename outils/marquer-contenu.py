#!/usr/bin/env python3
"""Repère dans index.html tout ce que Sylvain peut modifier depuis l'appli, et écrit la liste pour l'appli.

- chaque texte simple (titre, paragraphe, question de la FAQ…) reçoit data-t="t12" ;
- chaque vraie photo reçoit data-slot="photo-0725" (sur l'image et ses <source>) ;
- chaque ancien chantier de la page Réalisations reçoit data-bloc (pour pouvoir le cacher).

Les repères déjà posés ne changent jamais : un texte modifié dans l'appli reste attaché au bon endroit
même si on ajoute des sections plus tard. Écrit admin/site.json (pages, blocs dans l'ordre du site).

À relancer après chaque modification de index.html, AVANT outils/generer-pages.py :
    python3 outils/marquer-contenu.py && python3 outils/generer-pages.py
"""
import json, pathlib, re
from bs4 import BeautifulSoup, NavigableString

RACINE = pathlib.Path(__file__).resolve().parent.parent
SOURCE = RACINE / 'index.html'

PAGES = [
    ('accueil', 'Accueil', '/'),
    ('services', 'Mes prestations', '/catalogue'),
    ('realisations', 'Réalisations', '/realisations'),
    ('sap', 'Le demi-tarif', '/avantage-sap'),
    ('devis', 'Demande de devis', '/devis'),
    ('contact', 'Contact', '/contact'),
    ('faq', 'Questions fréquentes', '/faq'),
    ('guide', 'Guide Urssaf', '/guide-urssaf'),
]
PRESTAS = {'presta-haies': 'Taille de haies', 'presta-tonte': 'Tonte et débroussaillage', 'presta-terrasses': 'Terrasses et allées'}
BALISES = ['h1', 'h2', 'h3', 'h4', 'p', 'li', 'summary', 'dd', 'figcaption', 'blockquote']
LIBELLES = {'h1': 'Grand titre', 'h2': 'Titre', 'h3': 'Petit titre', 'h4': 'Petit titre', 'p': 'Texte',
            'li': 'Ligne de liste', 'summary': 'Question', 'dt': 'Intitulé', 'dd': 'Détail',
            'figcaption': 'Légende', 'blockquote': 'Citation'}

html = SOURCE.read_text(encoding='utf-8')
soup = BeautifulSoup(html, 'html.parser')

# numéros déjà utilisés
pris = {int(m) for m in re.findall(r'data-t="t(\d+)"', html)}
suivant = [max(pris) + 1 if pris else 1]

def texte_pur(el):
    if any(getattr(c, 'name', None) for c in el.children):
        return None
    t = el.get_text()
    t = re.sub(r'\s+', ' ', t.replace('\xa0', ' ')).strip()
    return t if len(t) >= 2 else None

def exclu(el):
    if el.find_parent('form') or el.find_parent(attrs={'data-chantiers-dyn': True}) or el.find_parent('template'):
        return True
    if el.find_parent(attrs={'data-compare': True}) or el.find_parent(attrs={'data-ba': True}):
        return True
    for a in el.attrs:
        if a.startswith('data-') and a not in ('data-t',) or a in ('id', 'hidden', 'aria-live'):
            return True
    return False

def est_photo(img):
    src = img.get('src') or ''
    return src.startswith('/assets/') and not src.endswith('.svg')

ajouter = []
manifeste = []
for pid, nom, url in PAGES:
    sec = soup.find('section', id='page-' + pid)
    blocs = []
    for el in sec.find_all(BALISES + ['img', 'article']):
        if el.name == 'article':
            if 'lb-chantier' in (el.get('class') or []) and el.get('id'):
                h = el.find('h2')
                if not el.get('data-bloc'):
                    el['data-bloc'] = el['id']; ajouter.append((el, ('data-bloc', el['id'])))
                blocs.append({'t': 'bloc', 'cle': el['id'], 'titre': h.get_text(strip=True) if h else el['id']})
            continue
        if el.name == 'img':
            if not est_photo(el) or el.find_parent(attrs={'data-compare': True}) or el.find_parent(attrs={'data-ba': True}):
                continue
            if not el.get('data-slot'):
                el['data-slot'] = 'photo-' + pathlib.Path(el['src']).stem.replace('-l', '').replace('-m', '')
                ajouter.append((el, ('data-slot', el['data-slot'])))
            pic = el.parent if el.parent and el.parent.name == 'picture' else None
            if pic:
                for so in pic.find_all('source'):
                    if not so.get('data-slot'):
                        so['data-slot'] = el['data-slot']; ajouter.append((so, ('data-slot', el['data-slot'])))
            w, h = int(el.get('width') or 4), int(el.get('height') or 3)
            cle = el['data-slot']
            if cle == 'accueil-haut':
                libelle = 'Grande photo du haut de la page'
            elif cle in PRESTAS:
                libelle = 'Photo « %s »' % PRESTAS[cle]
            elif 'n-tuile' in (el.get('class') or []):
                libelle = 'Photo de la mosaïque « Mes chantiers »'
            else:
                titre = el.find_next(['h2', 'h3'])
                libelle = 'Photo « %s »' % titre.get_text(' ', strip=True) if titre else 'Photo'
            blocs.append({'t': 'photo', 'cle': cle, 'libelle': libelle, 'src': el['src'], 'alt': el.get('alt', ''), 'portrait': h > w})
            continue
        t = texte_pur(el)
        if not t or exclu(el):
            continue
        if not el.get('data-t'):
            el['data-t'] = 't%d' % suivant[0]
            suivant[0] += 1
            ajouter.append((el, ('data-t', el['data-t'])))
        libelle = LIBELLES[el.name]
        if el.name == 'p' and el.find_parent('details'):
            libelle = 'Réponse'
        blocs.append({'t': 'texte', 'cle': el['data-t'], 'libelle': libelle, 'defaut': t, 'long': len(t) > 70 or el.name in ('p', 'dd', 'blockquote')})
    # une même photo peut apparaître deux fois sur une page : on ne la montre qu'une fois
    vus, propres = set(), []
    for b in blocs:
        k = (b['t'], b['cle'])
        if b['t'] == 'photo' and k in vus:
            continue
        vus.add(k)
        propres.append(b)
    manifeste.append({'id': pid, 'nom': nom, 'url': url, 'blocs': propres})

# On insère les nouveaux attributs dans le texte d'origine, à la position exacte de chaque balise,
# sans réécrire le reste du fichier (mise en forme, SVG, scripts restent intacts).
debuts = [0]
for ligne in html.split('\n'):
    debuts.append(debuts[-1] + len(ligne) + 1)
ajouts = []
for el, attr in ajouter:
    pos = debuts[el.sourceline - 1] + el.sourcepos
    assert html[pos] == '<' and html[pos + 1:pos + 1 + len(el.name)].lower() == el.name, (el.name, html[pos:pos + 20])
    ajouts.append((pos + 1 + len(el.name), ' %s="%s"' % attr))
sortie = html
for pos, txt in sorted(ajouts, reverse=True):
    sortie = sortie[:pos] + txt + sortie[pos:]
if ajouts:
    SOURCE.write_text(sortie, encoding='utf-8')

(RACINE / 'admin' / 'site.json').write_text(json.dumps({'pages': manifeste}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
n_t = sum(1 for p in manifeste for b in p['blocs'] if b['t'] == 'texte')
n_p = sum(1 for p in manifeste for b in p['blocs'] if b['t'] == 'photo')
print(f'{len(ajouter)} repères ajoutés. Appli : {n_t} textes, {n_p} photos, sur {len(manifeste)} pages.')
