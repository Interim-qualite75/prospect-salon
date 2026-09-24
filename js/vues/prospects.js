// Liste des prospects avec recherche, filtres et exports.

import { listeProspects, profil, echangesDe } from '../donnees.js';
import { $, esc, icone, initiales, nomComplet, dateRelative, dateCourte, telecharger } from '../ui.js';
import { ETAPES, TEMPERATURES, exportExcel, exportVCards } from '../outils.js';
import { etatRelance } from '../relances.js';
import { secteurDe, dirigeantDe } from '../entreprise.js';
import { syntheseEnsemble } from '../syntheses.js';

const filtres = { texte: '', salon: '', secteur: '', etape: '', temperature: '', tri: 'recent' };

const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function afficher(vue, params) {
  if (params[0] === 'salon') filtres.salon = profil().salon_en_cours || '';
  const tous = listeProspects();
  const salons = [...new Set(tous.map((p) => p.salon).filter(Boolean))].sort();
  const secteurs = [...new Set(tous.map((p) => secteurDe(p.entreprise)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  vue.innerHTML = `
    <div class="pile">
      <div class="ligne">
        <label class="recherche espace" style="min-width:220px">
          <span class="sr">Rechercher</span>
          <input type="search" id="texte" placeholder="Nom, société, ville, besoin…" value="${esc(filtres.texte)}">
        </label>
        <a class="btn primaire" href="#/scanner">${icone('plus')} Nouveau</a>
      </div>
      <div class="ligne">
        <select id="salon" class="btn petit" aria-label="Salon">
          <option value="">Tous les salons</option>
          ${salons.map((s) => `<option ${s === filtres.salon ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <select id="secteur" class="btn petit" aria-label="Secteur d'activité">
          <option value="">Tous les secteurs</option>
          ${secteurs.map((s) => `<option ${s === filtres.secteur ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <select id="etape" class="btn petit" aria-label="Étape">
          <option value="">Toutes les étapes</option>
          ${Object.entries(ETAPES).map(([k, v]) => `<option value="${k}" ${k === filtres.etape ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select id="temperature" class="btn petit" aria-label="Température">
          <option value="">Toutes températures</option>
          ${Object.entries(TEMPERATURES).map(([k, v]) => `<option value="${k}" ${k === filtres.temperature ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select id="tri" class="btn petit" aria-label="Trier">
          <option value="recent" ${filtres.tri === 'recent' ? 'selected' : ''}>Plus récents</option>
          <option value="relance" ${filtres.tri === 'relance' ? 'selected' : ''}>Prochaine relance</option>
          <option value="nom" ${filtres.tri === 'nom' ? 'selected' : ''}>Nom</option>
          <option value="societe" ${filtres.tri === 'societe' ? 'selected' : ''}>Société</option>
          <option value="secteur" ${filtres.tri === 'secteur' ? 'selected' : ''}>Secteur d'activité</option>
          <option value="dirigeant" ${filtres.tri === 'dirigeant' ? 'selected' : ''}>Dirigeant</option>
        </select>
      </div>
      <div class="ligne"><span class="discret espace" id="compte"></span>
        <button class="btn petit primaire" id="synthese">${icone('ia')} Synthèse</button>
        <button class="btn petit" id="export-excel">${icone('telecharger')} Excel</button>
        <button class="btn petit" id="export-vcf">${icone('contact')} Contacts</button>
      </div>
      <div class="liste" id="liste"></div>
    </div>`;

  let resultat = [];
  const dessiner = () => {
    const t = sansAccents(filtres.texte);
    resultat = tous.filter((p) => {
      if (filtres.salon && p.salon !== filtres.salon) return false;
      if (filtres.secteur && secteurDe(p.entreprise) !== filtres.secteur) return false;
      if (filtres.etape && p.etape !== filtres.etape) return false;
      if (filtres.temperature && p.temperature !== filtres.temperature) return false;
      if (!t) return true;
      return sansAccents([p.prenom, p.nom, p.societe, p.fonction, p.email, p.ville, p.salon, p.notes, (p.besoins || []).join(' '),
        p.entreprise?.activite, p.entreprise?.naf_libelle, p.entreprise?.naf, secteurDe(p.entreprise), dirigeantDe(p.entreprise)].join(' ')).includes(t);
    });
    // Les fiches sans secteur / sans dirigeant passent en fin de liste
    const parTexte = (f) => (a, b) => (f(a) ? (f(b) ? sansAccents(f(a)).localeCompare(sansAccents(f(b))) : -1) : f(b) ? 1 : 0);
    const cmp = {
      secteur: parTexte((p) => secteurDe(p.entreprise)),
      dirigeant: parTexte((p) => dirigeantDe(p.entreprise)),
      recent: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      relance: (a, b) => (a.relance_faite || !a.relance_at ? '9' : a.relance_at).localeCompare(b.relance_faite || !b.relance_at ? '9' : b.relance_at),
      nom: (a, b) => sansAccents(a.nom || a.societe).localeCompare(sansAccents(b.nom || b.societe)),
      societe: (a, b) => sansAccents(a.societe).localeCompare(sansAccents(b.societe)),
    }[filtres.tri];
    resultat.sort(cmp);
    $('#compte', vue).textContent = `${resultat.length} prospect${resultat.length > 1 ? 's' : ''}`;
    $('#liste', vue).innerHTML = resultat.length
      ? resultat.map(ligne).join('')
      : `<div class="vide">${icone('prospects')}<p>${tous.length ? 'Aucun prospect ne correspond.' : 'Aucun prospect pour le moment.'}</p>
          ${tous.length ? '' : '<a class="btn primaire" href="#/scanner" style="margin-top:12px">Scanner une première carte</a>'}</div>`;
  };

  $('#texte', vue).addEventListener('input', (e) => { filtres.texte = e.target.value; dessiner(); });
  for (const id of ['salon', 'secteur', 'etape', 'temperature', 'tri']) {
    $(`#${id}`, vue).addEventListener('change', (e) => { filtres[id] = e.target.value; dessiner(); });
  }
  const suffixe = () => (filtres.salon ? `-${sansAccents(filtres.salon).replace(/[^a-z0-9]+/g, '-')}` : '');
  // La synthèse porte sur la liste affichée : un salon, un secteur, une étape…
  $('#synthese', vue).addEventListener('click', () => {
    const precisions = [
      filtres.secteur && `secteur ${filtres.secteur}`,
      filtres.etape && `étape « ${ETAPES[filtres.etape]} »`,
      filtres.temperature && `prospects ${TEMPERATURES[filtres.temperature].toLowerCase()}s`,
      filtres.texte && `recherche « ${filtres.texte} »`,
    ].filter(Boolean).join(', ');
    const intitule = `${filtres.salon ? `Salon ${filtres.salon}` : 'Mes prospects'}${precisions ? ` – ${precisions}` : ''}`;
    syntheseEnsemble(resultat, intitule);
  });
  $('#export-excel', vue).addEventListener('click', () =>
    telecharger(exportExcel(resultat, echangesDe), `prospects${suffixe()}-${new Date().toISOString().slice(0, 10)}.csv`));
  $('#export-vcf', vue).addEventListener('click', () =>
    telecharger(exportVCards(resultat), `contacts${suffixe()}.vcf`));
  dessiner();
}

function ligne(p) {
  const er = etatRelance(p);
  return `
    <a class="element ${er === 'retard' ? 'retard' : er === 'jour' ? 'jour' : ''}" href="#/prospect/${p.id}">
      <span class="avatar">${esc(initiales(p))}</span>
      <span class="corps">
        <b>${esc(nomComplet(p))}</b>
        <div class="discret">${esc([p.fonction, p.societe].filter(Boolean).join(' · ') || p.email || '')}</div>
        ${p.entreprise?.siren ? `<div class="tres-discret">${esc([secteurDe(p.entreprise), dirigeantDe(p.entreprise) && `Dirigeant : ${dirigeantDe(p.entreprise)}`].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="ligne" style="gap:6px;margin-top:4px">
          ${p.temperature ? `<span class="pastille ${p.temperature}">${TEMPERATURES[p.temperature]}</span>` : ''}
          <span class="pastille">${esc(ETAPES[p.etape] || p.etape)}</span>
          ${er && er !== 'futur' ? `<span class="pastille ${er}">${icone('cloche')} ${esc(dateRelative(p.relance_at))}</span>`
            : er === 'futur' ? `<span class="tres-discret">Relance ${esc(dateRelative(p.relance_at, { heure: false }))}</span>` : ''}
          ${p.salon ? `<span class="tres-discret">${esc(p.salon)} · ${esc(dateCourte(p.date_rencontre))}</span>` : ''}
        </div>
      </span>
      ${icone('droite')}
    </a>`;
}
