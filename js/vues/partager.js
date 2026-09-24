// Partager mes infos : QR de mes coordonnées + QR de chaque document, mode plein écran pour le stand.

import { profil, listeDocuments, ajouterDocument, supprimerDocument, enregistrer } from '../donnees.js';
import { $, $$, esc, icone, toast, modale, confirmer, telecharger, partagerFichier, partagerLien } from '../ui.js';
import { qrSVG, qrPNG } from '../qr.js';
import { creerVCard, nomFichierVCard, telLisible } from '../vcard.js';

let choix = 0;

// Photo jointe au fichier .vcf envoyé (pas dans le QR : trop lourde)
async function photoBase64() {
  try {
    const rep = await fetch('img/photo-soraya.png');
    if (!rep.ok) return null;
    const bmp = await createImageBitmap(await rep.blob());
    const c = document.createElement('canvas');
    c.width = c.height = 240;
    c.getContext('2d').drawImage(bmp, 0, 0, 240, 240);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } catch {
    return null;
  }
}

function elements() {
  const moi = profil();
  const nom = [moi.prenom, moi.nom].filter(Boolean).join(' ');
  return [
    {
      type: 'contact',
      onglet: 'Mes coordonnées',
      titre: nom,
      sousTitre: [moi.fonction, moi.societe].filter(Boolean).join(' · '),
      texteQR: creerVCard(moi),
      aide: 'Le prospect scanne avec l’appareil photo de son téléphone (iPhone ou Android) et vous enregistre dans ses contacts, sans application ni internet.',
    },
    ...listeDocuments().map((d) => ({
      type: 'document',
      onglet: d.titre,
      titre: d.titre,
      sousTitre: moi.societe,
      texteQR: d.url_publique,
      doc: d,
      aide: 'Le prospect scanne et télécharge le document sur son téléphone.',
    })),
  ];
}

export async function afficher(vue) {
  const moi = profil();
  const items = elements();
  if (choix >= items.length) choix = 0;
  const it = items[choix];

  vue.innerHTML = `
    <div class="colonnes">
      <section class="pile">
        <div class="onglets" role="tablist">
          ${items.map((x, i) => `<button class="puce" role="tab" data-i="${i}" aria-pressed="${i === choix}" aria-selected="${i === choix}">${x.type === 'document' ? icone('fichier') : icone('contact')} ${esc(x.onglet)}</button>`).join('')}
        </div>
        <div class="carte pile" style="align-items:center;text-align:center">
          <div class="cadre-qr" id="qr"><div class="spinner"></div></div>
          <div><h2>${esc(it.titre)}</h2><p class="discret">${esc(it.sousTitre || '')}</p></div>
          ${it.type === 'contact' ? `
            <p class="discret">${[moi.tel_mobile && `${icone('mobile')} ${esc(telLisible(moi.tel_mobile))}`, moi.email && `${icone('mail')} ${esc(moi.email)}`].filter(Boolean).join(' &nbsp; ')}</p>` : ''}
          <p class="tres-discret" style="max-width:420px">${esc(it.aide)}</p>
          <div class="ligne" style="justify-content:center">
            <button class="btn primaire" id="plein">${icone('plein')} Plein écran</button>
            <button class="btn" id="envoyer">${icone('partager')} ${it.type === 'contact' ? 'Envoyer ma fiche' : 'Envoyer le lien'}</button>
            <button class="btn" id="png">${icone('telecharger')} Image du QR</button>
            ${it.type === 'document' ? `<a class="btn" href="${esc(it.doc.url_publique)}" target="_blank" rel="noopener">${icone('fichier')} Ouvrir</a>` : ''}
          </div>
        </div>
      </section>

      <section class="pile">
        <div class="carte pile-s">
          <div class="ligne"><h2 class="espace">${icone('fichier')} Mes documents</h2>
            <label class="btn petit primaire">${icone('envoyer')} Ajouter un PDF
              <input type="file" id="ajout-doc" accept="application/pdf,image/png,image/jpeg" class="sr"></label></div>
          <p class="tres-discret">Plaquette promo métier, présentation, grille… Chaque document a son QR code de téléchargement.</p>
          <div class="liste" id="docs">
            ${listeDocuments().length ? listeDocuments().map((d) => `
              <div class="element">
                <span class="avatar">${icone('fichier')}</span>
                <span class="corps"><b>${esc(d.titre)}</b><div class="tres-discret">${d.taille ? `${(d.taille / 1048576).toFixed(1)} Mo` : ''}</div></span>
                <button class="btn-icone" data-renommer="${d.id}" aria-label="Renommer ${esc(d.titre)}">${icone('crayon')}</button>
                <button class="btn-icone" data-supprimer="${d.id}" aria-label="Supprimer ${esc(d.titre)}">${icone('poubelle')}</button>
              </div>`).join('') : '<div class="vide"><p>Aucun document. Ajoutez votre plaquette PDF.</p></div>'}
          </div>
        </div>
        <div class="carte pile-s">
          <h2>${icone('contact')} Mes coordonnées</h2>
          <p class="discret">Le QR code « Mes coordonnées » reprend les informations de Réglages.</p>
          <a class="btn petit" href="#/reglages">${icone('crayon')} Modifier mes coordonnées</a>
        </div>
      </section>
    </div>`;

  $('#qr', vue).innerHTML = await qrSVG(it.texteQR, { titre: `QR code : ${it.titre}` });

  $$('[data-i]', vue).forEach((b) => b.addEventListener('click', () => { choix = Number(b.dataset.i); afficher(vue); }));
  $('#plein', vue).addEventListener('click', () => pleinEcran(items, choix));
  $('#png', vue).addEventListener('click', async () =>
    telecharger(await qrPNG(it.texteQR), `qr-${it.type === 'contact' ? 'mes-coordonnees' : it.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`));
  $('#envoyer', vue).addEventListener('click', async () => {
    if (it.type === 'contact') {
      const vcf = creerVCard(moi, { photoBase64: await photoBase64() });
      await partagerFichier(new Blob([vcf], { type: 'text/vcard' }), nomFichierVCard(moi), `${it.titre} – ${moi.societe}`);
    } else {
      await partagerLien(it.doc.url_publique, it.titre, `${it.titre} – ${moi.societe}`);
    }
  });

  $('#ajout-doc', vue).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!navigator.onLine) return toast('Connexion nécessaire pour mettre un document en ligne', 'erreur');
    if (f.size > 50 * 1048576) return toast('Document trop lourd (50 Mo maximum)', 'erreur');
    const { valeur, dlg } = await modale({
      titre: 'Nom du document',
      contenu: `<label class="champ"><span>Nom affiché aux prospects</span>
        <input name="titre" value="${esc(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))}"></label>`,
      actions: [{ libelle: 'Mettre en ligne', valeur: 'ok', classe: 'primaire' }],
    });
    if (valeur !== 'ok') return;
    toast('Envoi du document…');
    try {
      await ajouterDocument(f, dlg.querySelector('[name=titre]').value.trim() || f.name);
      choix = listeDocuments().length;
      toast('Document en ligne : son QR code est prêt', 'ok');
      afficher(vue);
    } catch (err) {
      toast(`Envoi impossible : ${err.message}`, 'erreur');
    }
  });

  $$('[data-supprimer]', vue).forEach((b) => b.addEventListener('click', async () => {
    const d = listeDocuments().find((x) => x.id === b.dataset.supprimer);
    if (!(await confirmer(`Supprimer « ${d.titre} » ? Son QR code ne fonctionnera plus.`, { ok: 'Supprimer', danger: true }))) return;
    await supprimerDocument(d);
    choix = 0;
    afficher(vue);
  }));
  $$('[data-renommer]', vue).forEach((b) => b.addEventListener('click', async () => {
    const d = listeDocuments().find((x) => x.id === b.dataset.renommer);
    const { valeur, dlg } = await modale({
      titre: 'Renommer',
      contenu: `<label class="champ"><span>Nom du document</span><input name="titre" value="${esc(d.titre)}"></label>`,
      actions: [{ libelle: 'Enregistrer', valeur: 'ok', classe: 'primaire' }],
    });
    const t = dlg.querySelector('[name=titre]').value.trim();
    if (valeur === 'ok' && t) {
      enregistrer('documents', { ...d, titre: t });
      afficher(vue);
    }
  }));
}

// ---------- Plein écran pour le stand ----------
async function pleinEcran(items, depart) {
  let i = depart;
  let verrou = null;
  const el = document.createElement('div');
  el.className = 'plein-ecran';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.append(el);

  const dessiner = async () => {
    const it = items[i];
    el.innerHTML = `
      <button class="btn-icone fermer" aria-label="Fermer">${icone('x')}</button>
      <img class="logo" src="img/logo-interim-qualite.png" alt="Intérim Qualité">
      <div id="qr-plein"></div>
      <div><div class="titre">${esc(it.type === 'contact' ? 'Enregistrez mon contact' : it.titre)}</div>
        <div class="sous-titre">${esc(it.type === 'contact' ? `${it.titre} · ${it.sousTitre}` : 'Scannez pour télécharger')}</div></div>
      ${items.length > 1 ? `<div class="fleches">
        <button class="btn" data-dir="-1" aria-label="QR précédent">${icone('gauche')}</button>
        <button class="btn" data-dir="1" aria-label="QR suivant">${icone('droite')}</button></div>` : ''}`;
    el.querySelector('#qr-plein').innerHTML = await qrSVG(it.texteQR, { titre: it.titre });
    el.querySelector('.fermer').onclick = fermer;
    el.querySelectorAll('[data-dir]').forEach((b) => (b.onclick = () => changer(Number(b.dataset.dir))));
    el.querySelector('.fermer').focus();
  };
  const changer = (d) => { i = (i + d + items.length) % items.length; dessiner(); };
  const clavier = (e) => {
    if (e.key === 'Escape') fermer();
    if (e.key === 'ArrowRight') changer(1);
    if (e.key === 'ArrowLeft') changer(-1);
  };
  let x0 = null;
  el.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60 && items.length > 1) changer(dx < 0 ? 1 : -1);
    x0 = null;
  });
  function fermer() {
    document.removeEventListener('keydown', clavier);
    verrou?.release().catch(() => {});
    el.remove();
  }
  document.addEventListener('keydown', clavier);
  // Garde l'écran allumé pendant que le prospect scanne
  try { verrou = await navigator.wakeLock?.request('screen'); } catch {}
  dessiner();
}
