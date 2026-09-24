// Fiche prospect : création (après un scan) et modification.

import {
  etat, profil, enregistrer, supprimer, echangesDe, listeProspects, listeDocuments,
  enregistrerPhotoCarte, urlPhotoCarte, nouvelId,
} from '../donnees.js';
import {
  $, $$, esc, icone, toast, modale, confirmer, nomComplet, dateRelative, dateCourte,
  versChampDateHeure, depuisChampDateHeure, dansJours, telecharger,
} from '../ui.js';
import { rechercher, completer, formaterEuros } from '../entreprise.js';
import { brancherDictee, dicteeDisponible, fichierIcs, lienOutlook, lienGoogleAgenda, lienEmailSuivi, ETAPES } from '../outils.js';
import { mettreEnFormeCR } from '../ocr.js';
import { creerVCard, nomFichierVCard, telInternational } from '../vcard.js';

let brouillon = null;
export function definirBrouillon(b) {
  brouillon = b;
}

const TYPES_ECHANGE = { salon: 'Salon', appel: 'Appel', rdv: 'RDV', visio: 'Visio', email: 'Email', document: 'Document envoyé' };

const champ = (nom, libelle, valeur, { type = 'text', auto = 'off', mode = '', ph = '' } = {}) => `
  <label class="champ"><span>${libelle}</span>
    <input name="${nom}" type="${type}" value="${esc(valeur ?? '')}" autocomplete="${auto}" ${mode ? `inputmode="${mode}"` : ''} placeholder="${esc(ph)}"></label>`;

const zoneDictee = (nom, libelle, valeur, ph) => `
  <label class="champ"><span>${libelle}</span>
    <div class="zone-dictee">
      <textarea name="${nom}" placeholder="${esc(ph)}">${esc(valeur ?? '')}</textarea>
      <button type="button" class="micro" data-micro="${nom}" aria-label="Dicter" aria-pressed="false">${icone('micro')}</button>
    </div></label>`;

function blocEntreprise(e) {
  if (!e?.siren) return '';
  const lignes = [
    ['SIREN', e.siren.replace(/(\d{3})(?=\d)/g, '$1 ')],
    ['Forme', e.forme_juridique],
    ['Activité', [e.naf, e.activite].filter(Boolean).join(' – ')],
    ['Siège', [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
    ['Effectif', e.effectif],
    ['Création', e.date_creation && dateCourte(e.date_creation)],
    ['CA', e.ca != null ? `${formaterEuros(e.ca)}${e.annee_finances ? ` (${e.annee_finances})` : ''}` : ''],
    ['Résultat', e.resultat != null ? formaterEuros(e.resultat) : ''],
    ['Dirigeants', (e.dirigeants || []).map((d) => `${d.nom}${d.qualite ? ` (${d.qualite})` : ''}`).join(', ')],
    ['TVA', e.tva],
  ].filter(([, v]) => v);
  return `
    <div class="bloc-entreprise">
      <div class="ligne"><b class="espace">${esc(e.nom)}</b>
        <span class="pastille bleu">${esc(e.source)}</span>
        ${e.active === false ? '<span class="pastille retard">Fermée</span>' : ''}</div>
      <dl>${lignes.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>`;
}

// ============================================================
export async function afficher(vue, params, { aller, titre }) {
  const moi = profil();
  const nouveau = !params.length;
  let photoBlob = null;
  let p;

  if (nouveau) {
    const b = brouillon || {};
    brouillon = null;
    photoBlob = b.photoBlob || null;
    p = {
      id: nouvelId(),
      salon: moi.salon_en_cours || '',
      date_rencontre: new Date().toISOString().slice(0, 10),
      etape: 'nouveau',
      besoins: [],
      entreprise: {},
      ocr_texte: b.ocr_texte || '',
      ...b.champs,
    };
  } else {
    const existant = etat.prospects.get(params[0]);
    if (!existant) {
      vue.innerHTML = `<div class="vide">${icone('alerte')}<p>Cette fiche n'existe plus.</p><a class="btn" href="#/prospects">Retour aux prospects</a></div>`;
      return;
    }
    p = structuredClone(existant);
    titre(nomComplet(p));
  }

  let modifie = nouveau;
  const besoinsListe = [...new Set([...(moi.besoins_liste || []), ...(p.besoins || [])])];
  const historique = nouveau ? [] : echangesDe(p.id);

  vue.innerHTML = `
    <form class="pile" id="fiche" novalidate>
      ${nouveau && (photoBlob || p.ocr_texte) ? `<div class="bandeau">${icone('ok')}<div>Carte lue. Vérifiez les champs avant d'enregistrer.</div></div>` : ''}

      ${!nouveau ? `
        <div class="carte">
          <div class="ligne">
            <span class="avatar">${esc((p.prenom?.[0] || '') + (p.nom?.[0] || '') || '?')}</span>
            <div class="espace"><h1>${esc(nomComplet(p))}</h1>
              <p class="discret">${esc([p.fonction, p.societe].filter(Boolean).join(' · '))}</p></div>
          </div>
          <div class="actions-fiche" style="margin-top:14px">
            ${p.tel_mobile || p.tel_fixe ? `<a class="btn petit" href="tel:${esc(telInternational(p.tel_mobile || p.tel_fixe))}">${icone('tel')} Appeler</a>` : ''}
            ${p.tel_mobile ? `<a class="btn petit" href="sms:${esc(telInternational(p.tel_mobile))}">${icone('sms')} SMS</a>` : ''}
            ${p.email ? `<a class="btn petit" href="mailto:${esc(p.email)}">${icone('mail')} Email</a>` : ''}
            <button type="button" class="btn petit" id="email-suivi">${icone('fichier')} Email de suivi</button>
            <button type="button" class="btn petit" id="vers-contacts">${icone('contact')} Dans mes contacts</button>
          </div>
        </div>` : ''}

      <div class="colonnes">
        <div class="pile">
          <section class="carte pile-s">
            <h2>${icone('carte')} Contact</h2>
            <div class="ligne" id="zone-photo" hidden>
              <img class="miniature-carte" id="photo-carte" alt="Photo de la carte de visite">
              <span class="tres-discret espace">Photo de la carte</span>
            </div>
            <div class="grille-2">
              ${champ('prenom', 'Prénom', p.prenom, { auto: 'off' })}
              ${champ('nom', 'Nom', p.nom)}
              ${champ('fonction', 'Fonction', p.fonction)}
              ${champ('societe', 'Société', p.societe)}
              ${champ('email', 'Email', p.email, { type: 'email', mode: 'email' })}
              ${champ('tel_mobile', 'Mobile', p.tel_mobile, { type: 'tel', mode: 'tel' })}
              ${champ('tel_fixe', 'Téléphone fixe', p.tel_fixe, { type: 'tel', mode: 'tel' })}
              ${champ('site', 'Site web', p.site, { mode: 'url' })}
              ${champ('adresse', 'Adresse', p.adresse)}
              <div class="grille-2">${champ('code_postal', 'Code postal', p.code_postal, { mode: 'numeric' })}${champ('ville', 'Ville', p.ville)}</div>
            </div>
            ${p.ocr_texte ? `<details class="texte-lu"><summary>Texte lu sur la carte</summary><pre>${esc(p.ocr_texte)}</pre></details>` : ''}
          </section>

          <section class="carte pile-s">
            <div class="ligne"><h2 class="espace">${icone('entreprise')} Entreprise</h2>
              <button type="button" class="btn petit primaire" id="chercher-entreprise">${icone('loupe')} ${p.entreprise?.siren ? 'Changer' : 'Rechercher'}</button></div>
            <div id="bloc-entreprise">${blocEntreprise(p.entreprise) || '<p class="discret">Recherche automatique à partir du nom de la société (Pappers / Annuaire des entreprises).</p>'}</div>
          </section>
        </div>

        <div class="pile">
          <section class="carte pile-s">
            <h2>${icone('prospects')} Suivi</h2>
            <div class="grille-2">
              ${champ('salon', 'Salon / événement', p.salon)}
              ${champ('date_rencontre', 'Date de rencontre', p.date_rencontre, { type: 'date' })}
            </div>
            <label class="champ"><span>Étape</span>
              <select name="etape">${Object.entries(ETAPES).map(([k, v]) => `<option value="${k}" ${p.etape === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <div class="champ"><span>Température</span>
              <div class="puces" id="temperature">
                ${[['chaud', 'Chaud'], ['tiede', 'Tiède'], ['froid', 'Froid']].map(([k, v]) => `<button type="button" class="puce ${k}" data-t="${k}" aria-pressed="${p.temperature === k}">${v}</button>`).join('')}
              </div></div>
            <div class="champ"><span>Besoins</span>
              <div class="puces" id="besoins">
                ${besoinsListe.map((b) => `<button type="button" class="puce" data-b="${esc(b)}" aria-pressed="${(p.besoins || []).includes(b)}">${esc(b)}</button>`).join('')}
                <button type="button" class="puce" id="besoin-autre">${icone('plus')} Autre</button>
              </div></div>
            ${nouveau
              ? zoneDictee('compte_rendu', "Compte rendu de l'échange", '', 'Appuyez sur le micro et parlez : besoins, postes, volumes, prochaine étape…')
              : zoneDictee('notes', 'Notes générales', p.notes, 'Informations utiles sur ce prospect')}
            ${moi.ia_cle ? `<button type="button" class="btn petit" id="ia-cr">${icone('ia')} Mettre en forme avec l'IA</button>` : ''}
            ${!dicteeDisponible ? `<p class="tres-discret">Astuce : utilisez le micro de votre clavier pour dicter.</p>` : ''}
          </section>

          <section class="carte pile-s">
            <h2>${icone('cloche')} Relance</h2>
            ${champ('relance_at', 'Date et heure', versChampDateHeure(p.relance_faite ? null : p.relance_at), { type: 'datetime-local' })}
            <div class="puces">
              ${[[1, 'Demain'], [2, '+2 jours'], [7, '+1 semaine'], [14, '+2 semaines'], [30, '+1 mois']].map(([j, l]) => `<button type="button" class="puce" data-jours="${j}">${l}</button>`).join('')}
              <button type="button" class="puce" id="sans-relance">${icone('x')} Aucune</button>
            </div>
            ${champ('relance_motif', 'Motif', p.relance_faite ? '' : p.relance_motif, { ph: 'Rappeler pour devis, envoyer la plaquette…' })}
            <button type="button" class="btn" id="vers-agenda">${icone('agenda')} Ajouter à mon agenda (avec alarme)</button>
          </section>

          ${!nouveau ? `
            <section class="carte pile-s">
              <div class="ligne"><h2 class="espace">${icone('fichier')} Comptes rendus</h2>
                <button type="button" class="btn petit primaire" id="ajouter-cr">${icone('plus')} Ajouter</button></div>
              <div class="historique">
                ${historique.length ? historique.map((e) => `
                  <div class="echange">
                    <div class="ligne"><span class="pastille bleu">${esc(TYPES_ECHANGE[e.type] || e.type)}</span>
                      <span class="tres-discret">${esc(dateRelative(e.date_echange))}</span></div>
                    <p>${esc(e.contenu)}</p>
                  </div>`).join('') : '<p class="discret">Aucun compte rendu pour le moment.</p>'}
              </div>
            </section>
            <button type="button" class="btn danger" id="supprimer">${icone('poubelle')} Supprimer cette fiche</button>` : ''}
        </div>
      </div>

      <div class="barre-enregistrer">
        <a class="btn fantome" href="${nouveau ? '#/scanner' : '#/prospects'}">Annuler</a>
        <button type="submit" class="btn primaire espace">${icone('ok')} Enregistrer</button>
      </div>
    </form>`;

  const form = $('#fiche', vue);
  form.addEventListener('input', () => (modifie = true));

  // Photo de la carte
  (async () => {
    const url = photoBlob ? URL.createObjectURL(photoBlob) : await urlPhotoCarte(p.carte_chemin);
    if (url) {
      $('#photo-carte', vue).src = url;
      $('#zone-photo', vue).hidden = false;
      $('#photo-carte', vue).onclick = () => modale({ titre: 'Carte de visite', contenu: `<img src="${url}" class="apercu-carte" style="max-height:none" alt="">`, large: true });
    }
  })();

  // Dictée
  const arrets = $$('[data-micro]', vue).map((b) =>
    brancherDictee(b, form.elements[b.dataset.micro], {
      surEtat: (s) => {
        if (s === null) toast('Dictée non disponible ici : utilisez le micro du clavier');
        if (s === 'refuse') toast("Autorisez le micro pour cette app dans les réglages du téléphone", 'erreur');
      },
    }),
  );

  // Température (un seul choix) et besoins (plusieurs)
  $('#temperature', vue).addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    p.temperature = p.temperature === b.dataset.t ? null : b.dataset.t;
    $$('[data-t]', vue).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.t === p.temperature)));
    modifie = true;
  });
  $('#besoins', vue).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-b]');
    if (b) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      modifie = true;
      return;
    }
    if (e.target.closest('#besoin-autre')) {
      const { valeur, dlg } = await modale({
        titre: 'Autre besoin',
        contenu: champ('besoin', 'Besoin', '', { ph: 'Caristes CACES 3, préparateurs…' }),
        actions: [{ libelle: 'Ajouter', valeur: 'ok', classe: 'primaire' }],
        onOuvert: (d) => d.querySelector('input').focus(),
      });
      const v = dlg.querySelector('input').value.trim();
      if (valeur === 'ok' && v) {
        const nb = document.createElement('button');
        nb.type = 'button';
        nb.className = 'puce';
        nb.dataset.b = v;
        nb.setAttribute('aria-pressed', 'true');
        nb.textContent = v;
        $('#besoin-autre', vue).before(nb);
        modifie = true;
      }
    }
  });

  // Relance
  $$('[data-jours]', vue).forEach((b) =>
    b.addEventListener('click', () => {
      form.elements.relance_at.value = versChampDateHeure(dansJours(Number(b.dataset.jours)));
      if (!form.elements.relance_motif.value) form.elements.relance_motif.value = 'Rappeler';
      modifie = true;
    }),
  );
  $('#sans-relance', vue).addEventListener('click', () => {
    form.elements.relance_at.value = '';
    form.elements.relance_motif.value = '';
    modifie = true;
  });
  $('#vers-agenda', vue).addEventListener('click', () => {
    const q = lireFormulaire();
    if (!q.relance_at) return toast("Choisissez d'abord une date de relance");
    choisirAgenda(q);
  });

  // Entreprise
  $('#chercher-entreprise', vue).addEventListener('click', async () => {
    const q = form.elements.societe.value || form.elements.email.value.split('@')[1]?.split('.')[0] || '';
    const e = await choisirEntreprise(q, moi.pappers_token);
    if (!e) return;
    p.entreprise = e;
    p.siren = e.siren;
    if (!form.elements.societe.value) form.elements.societe.value = e.nom;
    if (!form.elements.adresse.value && !form.elements.ville.value) {
      form.elements.adresse.value = e.adresse.split(/\s\d{5}\s/)[0] || '';
      form.elements.code_postal.value = e.code_postal;
      form.elements.ville.value = e.ville;
    }
    $('#bloc-entreprise', vue).innerHTML = blocEntreprise(e);
    $('#chercher-entreprise', vue).innerHTML = `${icone('loupe')} Changer`;
    modifie = true;
  });

  // IA : mise en forme du compte rendu
  $('#ia-cr', vue)?.addEventListener('click', async (ev) => {
    const zone = form.elements.compte_rendu || form.elements.notes;
    if (!zone.value.trim()) return toast("Dictez ou écrivez d'abord le compte rendu");
    ev.currentTarget.disabled = true;
    try {
      const r = await mettreEnFormeCR(zone.value, { prospect: nomComplet(lireFormulaire()), type: 'salon', societe: moi.societe }, moi.ia_cle);
      zone.value = r.compte_rendu + (r.prochaine_action ? `\n\nProchaine action : ${r.prochaine_action}` : '');
      if (r.relance_dans_jours > 0 && !form.elements.relance_at.value) {
        form.elements.relance_at.value = versChampDateHeure(dansJours(r.relance_dans_jours));
        form.elements.relance_motif.value = r.prochaine_action || 'Rappeler';
      }
      for (const besoin of r.besoins || []) {
        if (![...$$('[data-b]', vue)].some((x) => x.dataset.b.toLowerCase() === besoin.toLowerCase())) {
          const nb = document.createElement('button');
          Object.assign(nb, { type: 'button', className: 'puce', textContent: besoin });
          nb.dataset.b = besoin;
          nb.setAttribute('aria-pressed', 'true');
          $('#besoin-autre', vue).before(nb);
        }
      }
      modifie = true;
      toast('Compte rendu mis en forme', 'ok');
    } catch (e) {
      toast(`IA indisponible : ${e.message}`, 'erreur');
    } finally {
      ev.currentTarget.disabled = false;
    }
  });

  // Actions d'une fiche existante
  $('#email-suivi', vue)?.addEventListener('click', () => {
    const q = lireFormulaire();
    location.href = lienEmailSuivi(q, moi, listeDocuments());
    enregistrer('echanges', { prospect_id: p.id, type: 'email', contenu: 'Email de suivi envoyé avec les documents', date_echange: new Date().toISOString() });
  });
  $('#vers-contacts', vue)?.addEventListener('click', () => {
    const q = lireFormulaire();
    telecharger(new Blob([creerVCard(q)], { type: 'text/vcard;charset=utf-8' }), nomFichierVCard(q));
  });
  $('#ajouter-cr', vue)?.addEventListener('click', async () => {
    if (modifie) sauver({ silencieux: true });
    if (await ajouterCompteRendu(etat.prospects.get(p.id))) {
      modifie = false;
      afficher(vue, params, { aller, titre });
    }
  });
  $('#supprimer', vue)?.addEventListener('click', async () => {
    if (!(await confirmer(`Supprimer définitivement la fiche de ${nomComplet(p)} et ses comptes rendus ?`, { ok: 'Supprimer', danger: true }))) return;
    supprimer('prospects', p.id);
    modifie = false;
    toast('Fiche supprimée');
    aller('prospects');
  });

  function lireFormulaire() {
    const f = form.elements;
    const val = (n) => f[n]?.value.trim() || '';
    return {
      ...p,
      prenom: val('prenom'),
      nom: val('nom'),
      fonction: val('fonction'),
      societe: val('societe'),
      email: val('email').toLowerCase(),
      tel_mobile: val('tel_mobile'),
      tel_fixe: val('tel_fixe'),
      site: val('site'),
      adresse: val('adresse'),
      code_postal: val('code_postal'),
      ville: val('ville'),
      salon: val('salon'),
      date_rencontre: val('date_rencontre') || null,
      etape: f.etape.value,
      besoins: $$('[data-b][aria-pressed="true"]', vue).map((b) => b.dataset.b),
      notes: f.notes ? f.notes.value.trim() : p.notes,
      relance_at: depuisChampDateHeure(f.relance_at.value),
      relance_motif: val('relance_motif'),
      relance_faite: false,
    };
  }

  async function sauver({ silencieux = false } = {}) {
    const q = lireFormulaire();
    if (!q.prenom && !q.nom && !q.societe && !q.email) {
      toast('Indiquez au moins un nom, une société ou un email', 'erreur');
      return false;
    }
    if (q.relance_at && q.etape === 'nouveau') q.etape = 'a_relancer';
    if (nouveau && !silencieux) {
      const doublon = listeProspects().find(
        (x) => (q.email && x.email === q.email) || (q.tel_mobile && telInternational(x.tel_mobile) === telInternational(q.tel_mobile)),
      );
      if (doublon) {
        const { valeur } = await modale({
          titre: 'Contact déjà enregistré',
          contenu: `<p>${esc(nomComplet(doublon))}${doublon.societe ? ` (${esc(doublon.societe)})` : ''} a le même email ou le même mobile.</p>`,
          actions: [
            { libelle: 'Ouvrir la fiche existante', valeur: 'ouvrir', classe: 'secondaire' },
            { libelle: 'Enregistrer quand même', valeur: 'garder', classe: 'primaire' },
          ],
        });
        if (valeur === 'ouvrir') {
          modifie = false;
          aller(`prospect/${doublon.id}`);
          return false;
        }
        if (valeur !== 'garder') return false;
      }
    }
    delete q.compte_rendu;
    if (photoBlob) {
      q.carte_chemin = await enregistrerPhotoCarte(q.id, photoBlob);
      photoBlob = null;
    }
    enregistrer('prospects', q);
    p = q;
    const cr = form.elements.compte_rendu?.value.trim();
    if (nouveau && cr) {
      enregistrer('echanges', { prospect_id: q.id, type: q.salon ? 'salon' : 'rdv', contenu: cr, date_echange: new Date().toISOString() });
      form.elements.compte_rendu.value = '';
    }
    modifie = false;
    if (!silencieux) toast('Fiche enregistrée', 'ok');
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await sauver()) {
      if (nouveau) history.replaceState(null, '', `#/prospect/${p.id}`);
      aller(nouveau ? `prospect/${p.id}` : `prospect/${p.id}`);
    }
  });

  // En quittant l'écran : proposer d'enregistrer
  return async ({ depart } = {}) => {
    arrets.forEach((a) => a());
    if (!depart || !modifie) return true;
    const { valeur } = await modale({
      titre: 'Modifications non enregistrées',
      contenu: '<p>Voulez-vous enregistrer cette fiche avant de quitter ?</p>',
      actions: [
        { libelle: 'Ne pas enregistrer', valeur: 'non', classe: 'danger' },
        { libelle: 'Enregistrer', valeur: 'oui', classe: 'primaire' },
      ],
    });
    if (valeur === 'oui') return sauver();
    return valeur === 'non';
  };
}

// ============================================================
//  Recherche d'entreprise
// ============================================================
export async function choisirEntreprise(texteInitial, token) {
  let choix = null;
  let minuteur;
  await modale({
    titre: "Rechercher l'entreprise",
    large: true,
    contenu: `
      <label class="champ"><span>Nom de l'entreprise, SIREN ou SIRET</span>
        <input type="search" name="q" value="${esc(texteInitial)}" autocomplete="off"></label>
      <p class="tres-discret">${token ? 'Recherche gratuite, puis fiche Pappers complète (1 crédit) pour l’entreprise choisie.' : 'Annuaire des entreprises (gratuit). Ajoutez une clé Pappers dans Réglages pour plus de détails.'}</p>
      <div class="pile-s" id="resultats"></div>`,
    onOuvert: (dlg) => {
      const champQ = dlg.querySelector('[name=q]');
      const zone = dlg.querySelector('#resultats');
      let resultats = [];
      const lancer = async () => {
        const q = champQ.value.trim();
        if (q.length < 2) return (zone.innerHTML = '');
        zone.innerHTML = '<div class="ligne discret"><div class="spinner"></div> Recherche…</div>';
        try {
          resultats = await rechercher(q);
          zone.innerHTML = resultats.length
            ? resultats.map((r, i) => `
                <button type="button" class="resultat-entreprise" data-i="${i}">
                  <b>${esc(r.nom)}</b> ${r.active === false ? '<span class="pastille retard">Fermée</span>' : ''}
                  <div class="discret">${esc([r.code_postal, r.ville].filter(Boolean).join(' '))} · SIREN ${esc(r.siren)}</div>
                  <div class="tres-discret">${esc([r.naf, r.activite, r.effectif].filter(Boolean).join(' · '))}</div>
                </button>`).join('')
            : '<p class="discret">Aucune entreprise trouvée. Essayez un autre nom ou le SIREN.</p>';
        } catch (e) {
          zone.innerHTML = `<p class="discret">${esc(e.message)}</p>`;
        }
      };
      champQ.addEventListener('input', () => {
        clearTimeout(minuteur);
        minuteur = setTimeout(lancer, 400);
      });
      zone.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const r = resultats[Number(b.dataset.i)];
        zone.innerHTML = `<div class="ligne discret"><div class="spinner"></div> ${token ? 'Récupération de la fiche Pappers…' : 'Chargement…'}</div>`;
        try {
          choix = await completer(r, token);
        } catch (err) {
          toast(`${err.message} – données de l'Annuaire utilisées`, 'erreur');
          choix = err.resultatDeSecours || r;
        }
        dlg.close('ok');
      });
      if (champQ.value) lancer();
      champQ.focus();
    },
  });
  return choix;
}

// ============================================================
//  Agenda
// ============================================================
export async function choisirAgenda(p) {
  const { valeur } = await modale({
    titre: 'Ajouter la relance à mon agenda',
    contenu: `<p class="discret">${esc(dateRelative(p.relance_at))} · ${esc(p.relance_motif || 'Relance')}</p>
      <p class="tres-discret">Votre agenda vous préviendra même si l'app est fermée.</p>`,
    actions: [
      { libelle: `${icone('agenda')} Outlook`, valeur: 'outlook', classe: 'primaire' },
      { libelle: 'Google Agenda', valeur: 'google', classe: 'secondaire' },
      { libelle: 'Agenda du téléphone', valeur: 'ics', classe: 'secondaire' },
    ],
  });
  if (valeur === 'outlook') window.open(lienOutlook(p), '_blank', 'noopener');
  if (valeur === 'google') window.open(lienGoogleAgenda(p), '_blank', 'noopener');
  if (valeur === 'ics') telecharger(fichierIcs(p), `relance-${(p.nom || p.societe || 'prospect').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`);
}

// ============================================================
//  Nouveau compte rendu (depuis la fiche ou l'accueil)
// ============================================================
export async function ajouterCompteRendu(p, { depuisRelance = false } = {}) {
  const moi = profil();
  let type = 'appel';
  let arret = () => {};
  const { valeur, dlg } = await modale({
    titre: `Compte rendu – ${nomComplet(p)}`,
    large: true,
    contenu: `
      <div class="puces" id="types">${Object.entries(TYPES_ECHANGE).filter(([k]) => k !== 'document')
        .map(([k, v]) => `<button type="button" class="puce" data-type="${k}" aria-pressed="${k === type}">${v}</button>`).join('')}</div>
      ${champ('date_echange', 'Date', versChampDateHeure(new Date().toISOString()), { type: 'datetime-local' })}
      ${zoneDictee('contenu', 'Compte rendu', '', 'Appuyez sur le micro et parlez…')}
      ${moi.ia_cle ? `<button type="button" class="btn petit" id="ia">${icone('ia')} Mettre en forme avec l'IA</button>` : ''}
      <label class="champ"><span>Étape</span>
        <select name="etape">${Object.entries(ETAPES).map(([k, v]) => `<option value="${k}" ${p.etape === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="champ"><span>Prochaine relance</span>
        <div class="puces">${[[0, 'Aucune'], [2, '+2 jours'], [7, '+1 semaine'], [14, '+2 semaines'], [30, '+1 mois']]
          .map(([j, l]) => `<button type="button" class="puce" data-relance="${j}">${l}</button>`).join('')}</div></div>
      ${champ('relance_at', 'Date de relance', depuisRelance ? '' : versChampDateHeure(p.relance_faite ? null : p.relance_at), { type: 'datetime-local' })}
      ${champ('relance_motif', 'Motif de la relance', depuisRelance ? '' : p.relance_motif, { ph: 'Rappeler pour devis…' })}
      <p class="tres-discret" id="erreur-cr" role="alert"></p>`,
    actions: [
      { libelle: 'Annuler', valeur: 'non', classe: 'secondaire' },
      { libelle: 'Enregistrer', valeur: 'ok', classe: 'primaire' },
    ],
    onOuvert: (d) => {
      d.querySelector('#types').addEventListener('click', (e) => {
        const b = e.target.closest('[data-type]');
        if (!b) return;
        type = b.dataset.type;
        d.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      d.querySelectorAll('[data-relance]').forEach((b) =>
        b.addEventListener('click', () => {
          const j = Number(b.dataset.relance);
          d.querySelector('[name=relance_at]').value = j ? versChampDateHeure(dansJours(j)) : '';
          if (!j) d.querySelector('[name=relance_motif]').value = '';
          else if (!d.querySelector('[name=relance_motif]').value) d.querySelector('[name=relance_motif]').value = 'Rappeler';
        }),
      );
      arret = brancherDictee(d.querySelector('[data-micro]'), d.querySelector('[name=contenu]'), {
        surEtat: (s) => s === null && toast('Dictée non disponible ici : utilisez le micro du clavier'),
      });
      d.querySelector('#ia')?.addEventListener('click', async (ev) => {
        const zone = d.querySelector('[name=contenu]');
        if (!zone.value.trim()) return;
        ev.currentTarget.disabled = true;
        try {
          const r = await mettreEnFormeCR(zone.value, { prospect: nomComplet(p), type: TYPES_ECHANGE[type], societe: moi.societe }, moi.ia_cle);
          zone.value = r.compte_rendu + (r.prochaine_action ? `\n\nProchaine action : ${r.prochaine_action}` : '');
          if (r.relance_dans_jours > 0) {
            d.querySelector('[name=relance_at]').value = versChampDateHeure(dansJours(r.relance_dans_jours));
            d.querySelector('[name=relance_motif]').value = r.prochaine_action || 'Rappeler';
          }
        } catch (e) {
          toast(`IA indisponible : ${e.message}`, 'erreur');
        } finally {
          ev.currentTarget.disabled = false;
        }
      });
      // Pas de fermeture sans texte
      d.querySelector('form').addEventListener('submit', (e) => {
        if (e.submitter?.value === 'ok' && !d.querySelector('[name=contenu]').value.trim()) {
          e.preventDefault();
          d.querySelector('#erreur-cr').textContent = 'Écrivez ou dictez le compte rendu avant d’enregistrer.';
        }
      });
    },
  });
  arret();
  if (valeur !== 'ok') return false;

  const contenu = dlg.querySelector('[name=contenu]').value.trim();
  const relance = depuisChampDateHeure(dlg.querySelector('[name=relance_at]').value);
  enregistrer('echanges', {
    prospect_id: p.id,
    type,
    contenu,
    date_echange: depuisChampDateHeure(dlg.querySelector('[name=date_echange]').value) || new Date().toISOString(),
  });
  let etape = dlg.querySelector('[name=etape]').value;
  if (relance && etape === 'nouveau') etape = 'a_relancer';
  enregistrer('prospects', {
    ...p,
    etape,
    // Relance traitée depuis l'accueil : l'ancienne est marquée faite, sauf si une nouvelle date est choisie
    relance_at: relance || (depuisRelance ? p.relance_at : null),
    relance_motif: relance ? dlg.querySelector('[name=relance_motif]').value.trim() : depuisRelance ? p.relance_motif : '',
    relance_faite: relance ? false : depuisRelance,
  });
  toast('Compte rendu enregistré', 'ok');
  if (relance && (await confirmer('Ajouter aussi cette relance à votre agenda ?', { ok: 'Oui, ajouter' }))) {
    await choisirAgenda({ ...p, relance_at: relance, relance_motif: dlg.querySelector('[name=relance_motif]').value.trim() });
  }
  return true;
}
