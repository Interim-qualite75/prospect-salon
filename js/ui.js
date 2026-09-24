// Petits outils d'affichage partagés par tous les écrans.

export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

// Échappe tout texte venant d'une carte, d'une API ou d'une saisie avant de l'afficher
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const icone = (nom, extra = '') =>
  `<svg class="ic ${extra}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;

export function initiales(p) {
  const a = (p.prenom || '').trim()[0] || '';
  const b = (p.nom || '').trim()[0] || '';
  return (a + b).toUpperCase() || (p.societe || '?').trim()[0]?.toUpperCase() || '?';
}

export const nomComplet = (p) => [p.prenom, p.nom].filter(Boolean).join(' ') || p.societe || 'Sans nom';

// ---------- Dates ----------
const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtJourAnnee = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function debutJour(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dateRelative(iso, { heure = true } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  const jours = Math.round((debutJour(d) - debutJour()) / 86400000);
  let txt;
  if (jours === 0) txt = "aujourd'hui";
  else if (jours === 1) txt = 'demain';
  else if (jours === -1) txt = 'hier';
  else if (jours > 1 && jours < 7) txt = fmtJour.format(d);
  else if (jours < -1 && jours > -7) txt = `il y a ${-jours} jours`;
  else txt = d.getFullYear() === new Date().getFullYear() ? fmtJour.format(d) : fmtJourAnnee.format(d);
  const h = fmtHeure.format(d);
  return heure && h !== '00:00' ? `${txt} à ${h}` : txt;
}

export const dateCourte = (iso) => (iso ? fmtJourAnnee.format(new Date(iso)) : '');

// <input type="datetime-local"> travaille en heure locale sans fuseau
export function versChampDateHeure(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const depuisChampDateHeure = (v) => (v ? new Date(v).toISOString() : null);

export function dansJours(n, heure = 10) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(heure, 0, 0, 0);
  return d.toISOString();
}

// ---------- Messages ----------
let minuteurToast;
export function toast(message, type = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast visible ${type}`;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => (el.className = 'toast'), 3500);
}

// Fenêtre modale basée sur <dialog> (accessible au clavier, fermeture avec Échap)
export function modale({ titre, contenu, actions = [], large = false, onOuvert }) {
  return new Promise((resoudre) => {
    const dlg = document.createElement('dialog');
    dlg.className = `modale${large ? ' large' : ''}`;
    dlg.innerHTML = `
      <form method="dialog" class="modale-corps">
        <header class="modale-tete"><h2>${esc(titre)}</h2>
          <button class="btn-icone" value="" aria-label="Fermer">${icone('x')}</button></header>
        <div class="modale-contenu">${contenu}</div>
        ${actions.length ? `<footer class="modale-pied">${actions
          .map((a) => `<button class="btn ${a.classe || ''}" value="${esc(a.valeur)}">${a.libelle}</button>`)
          .join('')}</footer>` : ''}
      </form>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resoudre({ valeur: dlg.returnValue, dlg });
      setTimeout(() => dlg.remove(), 0);
    });
    dlg.showModal();
    onOuvert?.(dlg);
  });
}

export async function confirmer(message, { ok = 'Confirmer', danger = false } = {}) {
  const { valeur } = await modale({
    titre: 'Confirmation',
    contenu: `<p>${esc(message)}</p>`,
    actions: [
      { libelle: 'Annuler', valeur: 'non', classe: 'secondaire' },
      { libelle: esc(ok), valeur: 'oui', classe: danger ? 'danger' : 'primaire' },
    ],
  });
  return valeur === 'oui';
}

// ---------- Fichiers ----------
export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Partage natif (AirDrop, WhatsApp, SMS, mail…) avec repli sur le téléchargement
export async function partagerFichier(blob, nom, texte) {
  const fichier = new File([blob], nom, { type: blob.type });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom, text: texte });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  telecharger(blob, nom);
  return true;
}

export async function partagerLien(url, titre, texte) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title: titre, text: texte });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(url);
  toast('Lien copié');
}

export const estIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const estAppInstallee = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
