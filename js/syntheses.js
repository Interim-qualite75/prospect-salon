// Synthèses rédigées par l'IA (un prospect, un salon, une sélection) et export Word / PDF.

import { profil, echangesDe, listeTaches } from './donnees.js';
import { esc, icone, toast, modale, nomComplet, dateCourte, telecharger } from './ui.js';
import { synthetiser } from './ocr.js';
import { ETAPES, TEMPERATURES } from './outils.js';
import { secteurDe, dirigeantDe } from './entreprise.js';

const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.7.2/+esm';
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm';

export const PRIORITES = { urgente: 'Urgente', normale: 'Normale', faible: 'Faible' };

const ligneTache = (t) => `${t.titre} (${PRIORITES[t.priorite] || 'Normale'}${t.echeance ? `, pour le ${dateCourte(t.echeance)}` : ''})`;

// ---------- Données envoyées à l'IA ----------
function ficheEnTexte(p, { court = false } = {}) {
  const e = p.entreprise || {};
  const lignes = [
    `Contact : ${nomComplet(p)}${p.fonction ? `, ${p.fonction}` : ''}${p.societe ? ` – ${p.societe}` : ''}`,
    secteurDe(e) && `Secteur : ${secteurDe(e)}${e.naf_libelle ? ` (${e.naf_libelle})` : ''}`,
    e.effectif && `Effectif : ${e.effectif}`,
    dirigeantDe(e) && `Dirigeant : ${dirigeantDe(e)}`,
    p.ville && `Ville : ${p.ville}`,
    p.salon && `Rencontré : ${p.salon}${p.date_rencontre ? ` le ${dateCourte(p.date_rencontre)}` : ''}`,
    `Étape : ${ETAPES[p.etape] || p.etape}${p.temperature ? ` · ${TEMPERATURES[p.temperature]}` : ''}`,
    p.besoins?.length && `Besoins : ${p.besoins.join(', ')}`,
    p.relance_at && !p.relance_faite && `Relance prévue : ${dateCourte(p.relance_at)} (${p.relance_motif || 'relance'})`,
    p.notes && `Notes : ${court ? p.notes.slice(0, 300) : p.notes}`,
  ];
  const echanges = echangesDe(p.id);
  const taches = listeTaches({ prospectId: p.id });
  if (court) {
    if (echanges[0]) lignes.push(`Dernier échange (${dateCourte(echanges[0].date_echange)}) : ${(echanges[0].contenu || '').slice(0, 500)}`);
  } else {
    for (const x of echanges) lignes.push(`Échange du ${dateCourte(x.date_echange)} (${x.type}) : ${x.contenu || ''}`);
  }
  if (taches.length) lignes.push(`Tâches en cours : ${taches.map(ligneTache).join(' ; ')}`);
  return lignes.filter(Boolean).join('\n');
}

// ---------- Lancement et affichage ----------
async function lancer({ intitule, sujet, donnees, nomFichier, complements = [] }) {
  const moi = profil();
  if (!moi.ia_cle) {
    toast('Ajoutez votre clé IA dans Réglages pour obtenir des synthèses', 'erreur');
    return;
  }
  if (!navigator.onLine) {
    toast('Pas de réseau : la synthèse sera possible au retour de la connexion', 'erreur');
    return;
  }
  let doc = null;
  await modale({
    titre: 'Synthèse',
    large: true,
    contenu: '<div id="synthese" class="pile-s"><div class="ligne discret"><div class="spinner"></div> Rédaction de la synthèse… (quelques secondes)</div></div>',
    onOuvert: async (dlg) => {
      const zone = dlg.querySelector('#synthese');
      try {
        doc = await synthetiser(donnees, { sujet, intitule, societe: moi.societe }, moi.ia_cle);
        doc.sections.push(...complements.filter((s) => s.points.length));
        doc.date = new Date().toISOString();
        doc.auteur = nomComplet(moi);
        zone.innerHTML = `
          <div class="ligne">
            <button type="button" class="btn petit primaire" data-export="word">${icone('telecharger')} Word</button>
            <button type="button" class="btn petit primaire" data-export="pdf">${icone('telecharger')} PDF</button>
            <button type="button" class="btn petit" data-export="copier">${icone('fichier')} Copier le texte</button>
          </div>
          ${enHtml(doc)}`;
        zone.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-export]');
          if (!b) return;
          b.disabled = true;
          try {
            if (b.dataset.export === 'word') telecharger(await versWord(doc), `${nomFichier}.docx`);
            if (b.dataset.export === 'pdf') telecharger(await versPdf(doc), `${nomFichier}.pdf`);
            if (b.dataset.export === 'copier') {
              await navigator.clipboard.writeText(enTexte(doc));
              toast('Synthèse copiée : collez-la dans un email', 'ok');
            }
          } catch (err) {
            toast(`Export impossible : ${err.message}`, 'erreur');
          } finally {
            b.disabled = false;
          }
        });
      } catch (err) {
        zone.innerHTML = `<p class="discret">${icone('alerte')} Synthèse impossible : ${esc(err.message)}</p>`;
      }
    },
  });
}

export function syntheseProspect(p) {
  const nom = nomComplet(p);
  return lancer({
    sujet: 'prospect',
    intitule: `le prospect ${nom}${p.societe ? ` (${p.societe})` : ''}`,
    donnees: ficheEnTexte(p),
    nomFichier: `synthese-${nomFichierPropre(nom)}`,
    complements: [{ titre: 'Tâches enregistrées', points: listeTaches({ prospectId: p.id }).map(ligneTache) }],
  });
}

export function syntheseEnsemble(prospects, intitule) {
  if (!prospects.length) return toast('Aucun prospect dans cette sélection');
  // Au-delà, la synthèse deviendrait illisible (et coûteuse) : les plus récents d'abord
  const retenus = prospects.slice(0, 150);
  return lancer({
    sujet: 'ensemble',
    intitule: `${intitule} (${prospects.length} prospect${prospects.length > 1 ? 's' : ''})`,
    donnees: retenus.map((p, i) => `--- Prospect ${i + 1}\n${ficheEnTexte(p, { court: true })}`).join('\n\n'),
    nomFichier: `synthese-${nomFichierPropre(intitule)}`,
  });
}

const nomFichierPropre = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'synthese';

// ---------- Mises en forme ----------
const enteteDoc = (doc) => `Rédigée le ${dateCourte(doc.date)}${doc.auteur ? ` par ${doc.auteur}` : ''} · Intérim Qualité`;

function enHtml(doc) {
  return `
    <article class="synthese">
      <h3>${esc(doc.titre)}</h3>
      <p class="tres-discret">${esc(enteteDoc(doc))}</p>
      <p>${esc(doc.resume)}</p>
      ${doc.sections.map((s) => `<h4>${esc(s.titre)}</h4><ul>${s.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
    </article>`;
}

function enTexte(doc) {
  return [doc.titre, enteteDoc(doc), '', doc.resume, '',
    ...doc.sections.flatMap((s) => [s.titre.toUpperCase(), ...s.points.map((x) => `- ${x}`), ''])].join('\n');
}

async function versWord(doc) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import(DOCX);
  const bleu = '0571C2';
  const enfants = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.titre, color: bleu, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: enteteDoc(doc), italics: true, color: '5A6675', size: 18 })] }),
    new Paragraph({ text: doc.resume, spacing: { before: 200, after: 200 } }),
  ];
  for (const s of doc.sections) {
    enfants.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s.titre, color: bleu })] }));
    for (const x of s.points) enfants.push(new Paragraph({ text: x, bullet: { level: 0 } }));
  }
  const d = new Document({
    creator: doc.auteur || 'Prospect Salon',
    title: doc.titre,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: enfants }],
  });
  return Packer.toBlob(d);
}

// Les polices intégrées aux PDF ne connaissent que l'alphabet latin courant
const pourPdf = (s) => String(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/[–—]/g, '-').replace(/ | /g, ' ')
  .replace(/[^\x20-\x7E\xA0-\xFFŒœ€]/g, '');

async function versPdf(doc) {
  const { jsPDF } = await import(JSPDF);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const marge = 18, largeur = 210 - 2 * marge, bas = 297 - 18;
  let y = 22;
  const ecrire = (texte, { taille = 11, gras = false, couleur = [22, 32, 44], retrait = 0, apres = 2 } = {}) => {
    pdf.setFont('helvetica', gras ? 'bold' : 'normal');
    pdf.setFontSize(taille);
    pdf.setTextColor(...couleur);
    const lignes = pdf.splitTextToSize(pourPdf(texte), largeur - retrait);
    const h = taille * 0.42;
    for (const l of lignes) {
      if (y + h > bas) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(l, marge + retrait, y);
      y += h;
    }
    y += apres;
  };
  ecrire(doc.titre, { taille: 18, gras: true, couleur: [5, 113, 194], apres: 1 });
  ecrire(enteteDoc(doc), { taille: 9, couleur: [90, 102, 117], apres: 5 });
  ecrire(doc.resume, { apres: 5 });
  for (const s of doc.sections) {
    ecrire(s.titre, { taille: 13, gras: true, couleur: [5, 113, 194], apres: 2 });
    for (const x of s.points) {
      const y0 = y;
      ecrire(x, { retrait: 5, apres: 1.5 });
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(5, 113, 194);
      if (y0 < y) pdf.text('•', marge + 1, y0);
    }
    y += 3;
  }
  return pdf.output('blob');
}

// Pour les tests
export const _interne = { versWord, versPdf, enHtml, enTexte, ficheEnTexte };
