// Mes tâches : toutes les actions à mener, classées par priorité puis par échéance.

import { etat, enregistrer, supprimer, listeTaches, listeProspects } from '../donnees.js';
import { $$, esc, icone, toast, modale, confirmer, nomComplet, dateRelative, debutJour } from '../ui.js';
import { PRIORITES } from '../syntheses.js';
import { telInternational } from '../vcard.js';

// Date locale « AAAA-MM-JJ » dans n jours
export function dateDansJours(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const enRetard = (t) => !t.faite && t.echeance && new Date(`${t.echeance}T00:00`) < debutJour();

export function ligneTache(t, { avecProspect = true } = {}) {
  const p = t.prospect_id ? etat.prospects.get(t.prospect_id) : null;
  const retard = enRetard(t);
  return `
    <div class="element tache ${t.faite ? 'faite' : ''} ${retard ? 'retard' : ''}">
      <button type="button" class="case" data-cocher="${t.id}" role="checkbox" aria-checked="${!!t.faite}"
        aria-label="${t.faite ? 'Marquer à faire' : 'Marquer comme faite'}">${t.faite ? icone('ok') : ''}</button>
      <span class="corps">
        <b>${esc(t.titre)}</b>
        <div class="ligne" style="gap:6px;margin-top:4px">
          <span class="pastille ${t.priorite}">${PRIORITES[t.priorite] || 'Normale'}</span>
          ${t.echeance ? `<span class="tres-discret ${retard ? 'texte-retard' : ''}">${retard ? 'En retard · ' : ''}${esc(dateRelative(`${t.echeance}T00:00`, { heure: false }))}</span>` : ''}
          ${avecProspect && p ? `<a class="tres-discret" href="#/prospect/${p.id}">${esc(nomComplet(p))}${p.societe && p.prenom ? ` · ${esc(p.societe)}` : ''}</a>` : ''}
        </div>
      </span>
      ${p && (p.tel_mobile || p.tel_fixe) && !t.faite ? `<a class="btn-icone appel" href="tel:${esc(telInternational(p.tel_mobile || p.tel_fixe))}" aria-label="Appeler ${esc(nomComplet(p))}" title="Appeler">${icone('tel')}</a>` : ''}
      <button type="button" class="btn-icone" data-modifier="${t.id}" aria-label="Modifier la tâche">${icone('crayon')}</button>
    </div>`;
}

// Cases à cocher et boutons « modifier » d'une liste de tâches
export function brancherTaches(racine, rafraichir) {
  racine.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cocher]');
    const m = e.target.closest('[data-modifier]');
    if (c) {
      const t = etat.taches.get(c.dataset.cocher);
      if (!t) return;
      enregistrer('taches', { ...t, faite: !t.faite, faite_at: t.faite ? null : new Date().toISOString() });
      if (!t.faite) toast('Tâche faite', 'ok');
      rafraichir();
    } else if (m) {
      if (await editerTache(etat.taches.get(m.dataset.modifier))) rafraichir();
    }
  });
}

// Tâches proposées par l'IA après un compte rendu : cochées par défaut, priorité modifiable
export function htmlTachesProposees(taches) {
  if (!taches?.length) return '';
  return `
    <div class="champ"><span>Tâches proposées (décochez celles à ne pas garder)</span>
      <div class="carte" style="padding:6px 12px">${taches.map((t, i) => `
        <div class="tache-proposee" data-i="${i}">
          <button type="button" class="case" role="checkbox" aria-checked="true" aria-label="Garder cette tâche">${icone('ok')}</button>
          <input class="espace" name="tp-titre" value="${esc(t.titre)}" aria-label="Tâche">
          <select name="tp-priorite" aria-label="Priorité">${Object.entries(PRIORITES).map(([k, v]) =>
            `<option value="${k}" ${t.priorite === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <input type="hidden" name="tp-jours" value="${Number(t.echeance_dans_jours) || 0}">
        </div>`).join('')}
      </div></div>`;
}

export function brancherTachesProposees(racine) {
  racine.addEventListener('click', (e) => {
    const c = e.target.closest('.tache-proposee .case');
    if (!c) return;
    const on = c.getAttribute('aria-checked') !== 'true';
    c.setAttribute('aria-checked', String(on));
    c.innerHTML = on ? icone('ok') : '';
  });
}

// Enregistre les tâches cochées ; renvoie leur nombre
export function enregistrerTachesProposees(racine, { prospectId, echangeId = null }) {
  let n = 0;
  for (const l of racine.querySelectorAll('.tache-proposee')) {
    const titre = l.querySelector('[name=tp-titre]').value.trim();
    if (l.querySelector('.case').getAttribute('aria-checked') !== 'true' || !titre) continue;
    enregistrer('taches', {
      prospect_id: prospectId,
      echange_id: echangeId,
      titre,
      priorite: l.querySelector('[name=tp-priorite]').value,
      echeance: dateDansJours(Number(l.querySelector('[name=tp-jours]').value) || 0),
      faite: false,
    });
    n++;
  }
  return n;
}

// Création ou modification d'une tâche. Renvoie true si quelque chose a changé.
export async function editerTache(tache, { prospectId } = {}) {
  const t = tache || { priorite: 'normale', prospect_id: prospectId || null };
  const prospects = listeProspects();
  const { valeur, dlg } = await modale({
    titre: tache ? 'Modifier la tâche' : 'Nouvelle tâche',
    contenu: `
      <label class="champ"><span>Tâche</span>
        <input name="titre" value="${esc(t.titre || '')}" placeholder="Envoyer le devis, rappeler le DRH…" autocomplete="off"></label>
      <div class="champ"><span>Priorité</span>
        <div class="puces" id="priorites">${Object.entries(PRIORITES).map(([k, v]) =>
          `<button type="button" class="puce ${k}" data-p="${k}" aria-pressed="${t.priorite === k}">${v}</button>`).join('')}</div></div>
      <label class="champ"><span>Échéance</span><input type="date" name="echeance" value="${esc(t.echeance || '')}"></label>
      <div class="puces">${[[0, "Aujourd'hui"], [1, 'Demain'], [7, '+1 semaine'], [30, '+1 mois']]
        .map(([j, l]) => `<button type="button" class="puce" data-j="${j}">${l}</button>`).join('')}</div>
      ${prospectId || tache?.prospect_id ? '' : `
        <label class="champ"><span>Prospect (facultatif)</span>
          <select name="prospect"><option value="">Aucun</option>
            ${prospects.map((p) => `<option value="${p.id}">${esc(nomComplet(p))}${p.societe && p.prenom ? ` · ${esc(p.societe)}` : ''}</option>`).join('')}
          </select></label>`}
      <p class="tres-discret" id="erreur-tache" role="alert"></p>`,
    actions: [
      ...(tache ? [{ libelle: `${icone('poubelle')} Supprimer`, valeur: 'supprimer', classe: 'danger' }] : []),
      { libelle: 'Enregistrer', valeur: 'ok', classe: 'primaire' },
    ],
    onOuvert: (d) => {
      d.querySelector('[name=titre]').focus();
      d.querySelector('#priorites').addEventListener('click', (e) => {
        const b = e.target.closest('[data-p]');
        if (!b) return;
        t.priorite = b.dataset.p;
        d.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      d.querySelectorAll('[data-j]').forEach((b) =>
        b.addEventListener('click', () => (d.querySelector('[name=echeance]').value = dateDansJours(Number(b.dataset.j)))));
      d.querySelector('form').addEventListener('submit', (e) => {
        if (e.submitter?.value === 'ok' && !d.querySelector('[name=titre]').value.trim()) {
          e.preventDefault();
          d.querySelector('#erreur-tache').textContent = 'Décrivez la tâche avant d’enregistrer.';
        }
      });
    },
  });
  if (valeur === 'supprimer') {
    if (!(await confirmer(`Supprimer la tâche « ${tache.titre} » ?`, { ok: 'Supprimer', danger: true }))) return false;
    supprimer('taches', tache.id);
    return true;
  }
  if (valeur !== 'ok') return false;
  enregistrer('taches', {
    ...t,
    titre: dlg.querySelector('[name=titre]').value.trim(),
    echeance: dlg.querySelector('[name=echeance]').value || null,
    prospect_id: t.prospect_id || dlg.querySelector('[name=prospect]')?.value || null,
  });
  toast('Tâche enregistrée', 'ok');
  return true;
}

export function afficher(vue) {
  const aFaire = listeTaches();
  const faites = listeTaches({ faites: true }).slice(0, 30);
  const retard = aFaire.filter(enRetard);
  const groupes = [
    ['En retard', retard],
    ...Object.keys(PRIORITES).map((k) => [`${PRIORITES[k]}s`, aFaire.filter((t) => t.priorite === k && !enRetard(t))]),
  ].filter(([, l]) => l.length);

  vue.innerHTML = `
    <div class="pile" style="max-width:760px;margin:0 auto">
      <div class="ligne">
        <p class="discret espace">${aFaire.length} tâche${aFaire.length > 1 ? 's' : ''} à faire${retard.length ? ` · <b class="texte-retard">${retard.length} en retard</b>` : ''}</p>
        <button class="btn primaire" id="nouvelle">${icone('plus')} Nouvelle tâche</button>
      </div>
      ${etat.tachesServeur === false ? `<div class="bandeau alerte">${icone('alerte')}<div>Les tâches restent sur cet appareil tant que la base n’est pas mise à jour (Supabase).</div></div>` : ''}
      ${groupes.length ? groupes.map(([titre, l]) => `
        <section class="pile-s"><h2>${esc(titre)} <span class="tres-discret">(${l.length})</span></h2>
          <div class="liste">${l.map((t) => ligneTache(t)).join('')}</div></section>`).join('')
        : `<div class="vide">${icone('ok')}<p>Aucune tâche à faire.</p>
            <p class="tres-discret">Les tâches se créent ici, depuis une fiche, ou automatiquement quand l’IA met en forme un compte rendu.</p></div>`}
      ${faites.length ? `
        <details class="carte"><summary>Tâches faites récemment (${faites.length})</summary>
          <div class="liste" style="margin-top:10px">${faites.map((t) => ligneTache(t)).join('')}</div></details>` : ''}
    </div>`;

  const rafraichir = () => afficher(vue);
  $$('.liste', vue).forEach((l) => brancherTaches(l, rafraichir));
  vue.querySelector('#nouvelle').addEventListener('click', async () => {
    if (await editerTache()) rafraichir();
  });
}
