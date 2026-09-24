// Liste des prospects avec recherche, filtres et exports.

import { listeProspects, profil, echangesDe } from '../donnees.js';
import { $, esc, icone, initiales, nomComplet, dateRelative, dateCourte, telecharger } from '../ui.js';
import { ETAPES, TEMPERATURES, exportExcel, exportVCards } from '../outils.js';
import { etatRelance } from '../relances.js';

const filtres = { texte: '', salon: '', etape: '', temperature: '', tri: 'recent' };

const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function afficher(vue, params) {
  if (params[0] === 'salon') filtres.salon = profil().salon_en_cours || '';
  const tous = listeProspects();
  const salons = [...new Set(tous.map((p) => p.salon).filter(Boolean))].sort();

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
        </select>
      </div>
      <div class="ligne"><span class="discret espace" id="compte"></span>
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
      if (filtres.etape && p.etape !== filtres.etape) return false;
      if (filtres.temperature && p.temperature !== filtres.temperature) return false;
      if (!t) return true;
      return sansAccents([p.prenom, p.nom, p.societe, p.fonction, p.email, p.ville, p.salon, p.notes, (p.besoins || []).join(' '), p.entreprise?.activite].join(' ')).includes(t);
    });
    const cmp = {
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
  for (const id of ['salon', 'etape', 'temperature', 'tri']) {
    $(`#${id}`, vue).addEventListener('change', (e) => { filtres[id] = e.target.value; dessiner(); });
  }
  const suffixe = () => (filtres.salon ? `-${sansAccents(filtres.salon).replace(/[^a-z0-9]+/g, '-')}` : '');
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
