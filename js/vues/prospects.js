// Liste des prospects avec recherche, filtres, actions groupées et exports.

import { listeProspects, profil, echangesDe, enregistrer, supprimer } from '../donnees.js';
import { $, $$, esc, icone, initiales, nomComplet, dateRelative, dateCourte, telecharger, toast, modale, confirmer } from '../ui.js';
import { ETAPES, TEMPERATURES, exportExcel, exportVCards } from '../outils.js';
import { etatRelance } from '../relances.js';
import { secteurDe, dirigeantDe } from '../entreprise.js';
import { syntheseEnsemble } from '../syntheses.js';
import { telInternational } from '../vcard.js';

const filtres = { vue: 'actifs', texte: '', salon: '', secteur: '', etape: '', temperature: '', tri: 'recent' };
const VUES = { actifs: 'Mes prospects', archives: 'Archivés', corbeille: 'Corbeille' };

const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function afficher(vue, params) {
  if (params[0] === 'salon') {
    filtres.salon = profil().salon_en_cours || '';
    filtres.vue = 'actifs';
  }
  const tous = listeProspects({ vue: filtres.vue });
  const salons = [...new Set(tous.map((p) => p.salon).filter(Boolean))].sort();
  const secteurs = [...new Set(tous.map((p) => secteurDe(p.entreprise)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const selection = new Set();
  let modeSelection = false;

  vue.innerHTML = `
    <div class="pile">
      <div class="puces" role="tablist" aria-label="Fiches affichées">
        ${Object.entries(VUES).map(([k, v]) => `<button class="puce" data-vue="${k}" aria-pressed="${filtres.vue === k}">${v}
          <span class="tres-discret">(${listeProspects({ vue: k }).length})</span></button>`).join('')}
      </div>
      ${filtres.vue === 'corbeille' ? `<p class="tres-discret">Les fiches restent 30 jours dans la corbeille, puis elles sont effacées pour de bon.</p>` : ''}
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
        <button class="btn petit" id="selectionner">${icone('ok')} Sélectionner</button>
        <button class="btn petit primaire" id="synthese">${icone('ia')} Synthèse</button>
        <button class="btn petit" id="export-excel">${icone('telecharger')} Excel</button>
        <button class="btn petit" id="export-vcf">${icone('contact')} Contacts</button>
      </div>
      <div class="liste" id="liste"></div>
      <div class="barre-selection" id="barre-selection" hidden>
        <span id="nb-selection" class="espace"></span>
        <button class="btn petit" data-groupe="tout">Tout</button>
        ${filtres.vue === 'actifs' ? `
          <button class="btn petit" data-groupe="etape">Changer l'étape</button>
          <button class="btn petit" data-groupe="archiver">Archiver</button>` : ''}
        ${filtres.vue === 'archives' ? '<button class="btn petit" data-groupe="desarchiver">Désarchiver</button>' : ''}
        ${filtres.vue === 'corbeille' ? `
          <button class="btn petit" data-groupe="restaurer">Restaurer</button>
          <button class="btn petit danger" data-groupe="effacer">Effacer</button>`
          : '<button class="btn petit" data-groupe="exporter">Exporter</button><button class="btn petit danger" data-groupe="corbeille">Corbeille</button>'}
        <button class="btn petit fantome" data-groupe="fermer" aria-label="Quitter la sélection">${icone('x')}</button>
      </div>
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
      ? resultat.map((p) => ligne(p, modeSelection, selection.has(p.id))).join('')
      : `<div class="vide">${icone('prospects')}<p>${tous.length ? 'Aucun prospect ne correspond.'
        : filtres.vue === 'actifs' ? 'Aucun prospect pour le moment.' : filtres.vue === 'archives' ? 'Aucune fiche archivée.' : 'La corbeille est vide.'}</p>
          ${tous.length || filtres.vue !== 'actifs' ? '' : '<a class="btn primaire" href="#/scanner" style="margin-top:12px">Scanner une première carte</a>'}</div>`;
    majBarre();
  };
  const majBarre = () => {
    $('#barre-selection', vue).hidden = !modeSelection;
    $('#nb-selection', vue).textContent = `${selection.size} sélectionné${selection.size > 1 ? 's' : ''}`;
  };

  $('#texte', vue).addEventListener('input', (e) => { filtres.texte = e.target.value; dessiner(); });
  for (const id of ['salon', 'secteur', 'etape', 'temperature', 'tri']) {
    $(`#${id}`, vue).addEventListener('change', (e) => { filtres[id] = e.target.value; dessiner(); });
  }
  $$('[data-vue]', vue).forEach((b) => b.addEventListener('click', () => {
    filtres.vue = b.dataset.vue;
    afficher(vue, []);
  }));

  // Sélection : un appui coche la fiche au lieu de l'ouvrir
  $('#selectionner', vue).addEventListener('click', () => {
    modeSelection = !modeSelection;
    selection.clear();
    dessiner();
  });
  $('#liste', vue).addEventListener('click', (e) => {
    if (e.target.closest('[data-appel]')) return;   // le lien « Appeler » garde son comportement
    if (!modeSelection) return;
    const el = e.target.closest('[data-id]');
    if (!el) return;
    e.preventDefault();
    const id = el.dataset.id;
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    el.classList.toggle('selectionne', selection.has(id));
    el.querySelector('.case')?.setAttribute('aria-checked', String(selection.has(id)));
    el.querySelector('.case').innerHTML = selection.has(id) ? icone('ok') : '';
    majBarre();
  });

  $('#barre-selection', vue).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-groupe]');
    if (!b) return;
    const action = b.dataset.groupe;
    if (action === 'fermer') {
      modeSelection = false;
      selection.clear();
      return dessiner();
    }
    if (action === 'tout') {
      const toutes = resultat.every((p) => selection.has(p.id));
      resultat.forEach((p) => (toutes ? selection.delete(p.id) : selection.add(p.id)));
      return dessiner();
    }
    const choisis = resultat.filter((p) => selection.has(p.id));
    if (!choisis.length) return toast('Sélectionnez au moins une fiche');
    const n = choisis.length;
    const pluriel = n > 1 ? 's' : '';
    const pourTous = (champs) => choisis.forEach((p) => enregistrer('prospects', { ...p, ...champs }));

    if (action === 'etape') {
      const { valeur } = await modale({
        titre: `Changer l'étape de ${n} fiche${pluriel}`,
        contenu: `<div class="pile-s">${Object.entries(ETAPES).map(([k, v]) => `<button class="btn large" value="${k}">${v}</button>`).join('')}</div>`,
      });
      if (!ETAPES[valeur]) return;
      pourTous({ etape: valeur });
      toast(`${n} fiche${pluriel} passée${pluriel} en « ${ETAPES[valeur]} »`, 'ok');
    }
    if (action === 'archiver') {
      pourTous({ archive_at: new Date().toISOString() });
      toast(`${n} fiche${pluriel} archivée${pluriel}`, 'ok');
    }
    if (action === 'desarchiver') {
      pourTous({ archive_at: null });
      toast(`${n} fiche${pluriel} remise${pluriel} dans vos prospects`, 'ok');
    }
    if (action === 'exporter') {
      const { valeur } = await modale({
        titre: `Exporter ${n} fiche${pluriel}`,
        contenu: `<div class="pile-s"><button class="btn large" value="excel">${icone('telecharger')} Fichier Excel</button>
          <button class="btn large" value="vcf">${icone('contact')} Contacts (téléphone, Outlook)</button></div>`,
      });
      if (valeur === 'excel') telecharger(exportExcel(choisis, echangesDe), `prospects-selection-${new Date().toISOString().slice(0, 10)}.csv`);
      if (valeur === 'vcf') telecharger(exportVCards(choisis), 'contacts-selection.vcf');
      return;
    }
    if (action === 'corbeille') {
      if (!(await confirmer(`Mettre ${n} fiche${pluriel} à la corbeille ? Vous pourrez les restaurer pendant 30 jours.`, { ok: 'Mettre à la corbeille', danger: true }))) return;
      pourTous({ supprime_at: new Date().toISOString() });
      toast(`${n} fiche${pluriel} mise${pluriel} à la corbeille`, 'ok');
    }
    if (action === 'restaurer') {
      pourTous({ supprime_at: null });
      toast(`${n} fiche${pluriel} restaurée${pluriel}`, 'ok');
    }
    if (action === 'effacer') {
      if (!(await confirmer(`Effacer DÉFINITIVEMENT ${n} fiche${pluriel} (comptes rendus, tâches et propositions compris) ? C'est irréversible.`, { ok: 'Effacer définitivement', danger: true }))) return;
      choisis.forEach((p) => supprimer('prospects', p.id));
      toast(`${n} fiche${pluriel} effacée${pluriel}`, 'ok');
    }
    afficher(vue, []);
  });

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

function ligne(p, modeSelection, coche) {
  const er = etatRelance(p);
  const tel = p.tel_mobile || p.tel_fixe;
  return `
    <a class="element ${er === 'retard' ? 'retard' : er === 'jour' ? 'jour' : ''} ${coche ? 'selectionne' : ''}" href="#/prospect/${p.id}" data-id="${p.id}">
      ${modeSelection
        ? `<span class="case" role="checkbox" aria-checked="${coche}" aria-label="Sélectionner ${esc(nomComplet(p))}">${coche ? icone('ok') : ''}</span>`
        : `<span class="avatar">${esc(initiales(p))}</span>`}
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
      ${tel && !modeSelection ? `<span class="btn-icone appel" role="link" tabindex="0" data-appel aria-label="Appeler ${esc(nomComplet(p))}" title="Appeler"
        onclick="event.stopPropagation();event.preventDefault();location.href='tel:${esc(telInternational(tel))}'">${icone('tel')}</span>` : ''}
      ${modeSelection ? '' : icone('droite')}
    </a>`;
}
