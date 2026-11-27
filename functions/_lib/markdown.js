// Petit convertisseur pour le texte des articles : paragraphes, intertitres (## et ###),
// listes (- ), gras (**mot**). Tout le reste est échappé : aucun HTML ne passe tel quel.
import { esc } from './rendu.js';

function enLigne(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function versHTML(texte) {
  const lignes = String(texte || '').replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  let liste = null;
  const finPara = () => { if (para.length) { out.push('<p>' + enLigne(para.join(' ')) + '</p>'); para = []; } };
  const finListe = () => { if (liste) { out.push('<ul>' + liste.map((l) => '<li>' + enLigne(l) + '</li>').join('') + '</ul>'); liste = null; } };
  for (const brut of lignes) {
    const l = brut.trim();
    if (!l) { finPara(); finListe(); continue; }
    let m;
    if ((m = l.match(/^(#{2,3})\s+(.+)$/))) { finPara(); finListe(); out.push(`<h${m[1].length}>${enLigne(m[2])}</h${m[1].length}>`); continue; }
    if ((m = l.match(/^[-*•]\s+(.+)$/))) { finPara(); (liste = liste || []).push(m[1]); continue; }
    finListe();
    para.push(l);
  }
  finPara(); finListe();
  return out.join('\n');
}

export function texteBrut(texte) {
  return String(texte || '').replace(/^#{1,3}\s+/gm, '').replace(/\*\*/g, '').replace(/^[-*•]\s+/gm, '').replace(/\s+/g, ' ').trim();
}
