// Agenda (relances), dictée vocale, emails et exports.

import { creerVCard, telLisible, urlComplete } from './vcard.js';
import { nomComplet } from './ui.js';
import { secteurDe, dirigeantDe } from './entreprise.js';

// ============================================================
//  Agenda : la relance devient un rendez-vous avec alarme
// ============================================================
const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ajouterMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
const echapperIcs = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);

function detailsRelance(p) {
  return [
    p.relance_motif && `Motif : ${p.relance_motif}`,
    p.societe && `Société : ${p.societe}`,
    p.fonction && `Fonction : ${p.fonction}`,
    p.tel_mobile && `Mobile : ${telLisible(p.tel_mobile)}`,
    p.tel_fixe && `Fixe : ${telLisible(p.tel_fixe)}`,
    p.email && `Email : ${p.email}`,
    p.salon && `Rencontré(e) : ${p.salon}`,
  ].filter(Boolean).join('\n');
}

const titreRelance = (p) => `Relance ${nomComplet(p)}${p.societe ? ` (${p.societe})` : ''}`;

// Fichier .ics : ouvert par le Calendrier de l'iPhone, Outlook, Google Agenda (Android via Outlook/Gmail)
export function fichierIcs(p) {
  const debut = p.relance_at;
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Interim Qualite//Prospect Salon//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:relance-${p.id}@prospect-salon`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(debut)}`,
    `DTEND:${utc(ajouterMinutes(debut, 15))}`,
    `SUMMARY:${echapperIcs(titreRelance(p))}`,
    `DESCRIPTION:${echapperIcs(detailsRelance(p))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapperIcs(titreRelance(p))}`, 'TRIGGER:-PT0M', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapperIcs(titreRelance(p))}`, 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lignes.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
}

// Outlook (compte Microsoft 365 pro) : ouvre directement la création de l'événement
export function lienOutlook(p) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: titreRelance(p),
    startdt: new Date(p.relance_at).toISOString(),
    enddt: ajouterMinutes(p.relance_at, 15),
    body: detailsRelance(p),
  });
  return `https://outlook.office.com/calendar/deeplink/compose?${params}`;
}

export function lienGoogleAgenda(p) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titreRelance(p),
    dates: `${utc(p.relance_at)}/${utc(ajouterMinutes(p.relance_at, 15))}`,
    details: detailsRelance(p),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ============================================================
//  Dictée vocale (Chrome, Edge, Safari iPhone, Android)
// ============================================================
const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;
export const dicteeDisponible = !!Reconnaissance;

/**
 * Branche un bouton micro sur une zone de texte : le texte dicté s'ajoute au curseur.
 * Si la dictée n'existe pas sur l'appareil, le bouton explique d'utiliser le micro du clavier.
 */
export function brancherDictee(bouton, zone, { surEtat = () => {} } = {}) {
  let reco = null;
  let actif = false;
  let base = '';

  const arreter = () => {
    actif = false;
    reco?.stop();
    bouton.classList.remove('enregistre');
    bouton.setAttribute('aria-pressed', 'false');
    surEtat(false);
  };

  bouton.addEventListener('click', () => {
    if (!Reconnaissance) {
      surEtat(null);
      zone.focus();
      return;
    }
    if (actif) return arreter();
    reco = new Reconnaissance();
    reco.lang = 'fr-FR';
    reco.continuous = true;
    reco.interimResults = true;
    base = zone.value ? zone.value.replace(/\s*$/, ' ') : '';
    let definitif = '';
    reco.onresult = (e) => {
      let provisoire = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) definitif += t.trim() + ' ';
        else provisoire += t;
      }
      zone.value = ponctuer(base + definitif + provisoire);
      zone.dispatchEvent(new Event('input', { bubbles: true }));
    };
    reco.onerror = (e) => {
      if (e.error === 'not-allowed') surEtat('refuse');
      arreter();
    };
    // Safari coupe parfois tout seul : on relance tant que le micro n'a pas été arrêté
    reco.onend = () => {
      if (actif) {
        base = zone.value.replace(/\s*$/, ' ');
        definitif = '';
        try { reco.start(); } catch { arreter(); }
      }
    };
    actif = true;
    reco.start();
    bouton.classList.add('enregistre');
    bouton.setAttribute('aria-pressed', 'true');
    surEtat(true);
  });

  return arreter;
}

// « virgule », « point à la ligne », « à la ligne » dictés deviennent de la ponctuation
function ponctuer(t) {
  return t
    .replace(/\s*\bpoint à la ligne\b\s*/gi, '.\n')
    .replace(/\s*(?:^|\s)(à la ligne|nouvelle ligne)\b\s*/gi, '\n')
    .replace(/\s*\bvirgule\b/gi, ',')
    .replace(/\s*\bpoint d'interrogation\b/gi, ' ?')
    .replace(/(^|[.?!]\s+|\n)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
}

// ============================================================
//  Email de suivi après le salon
// ============================================================
export const MODELE_EMAIL_DEFAUT =
  `Bonjour {prenom},

Suite à notre échange{salon}, je vous remercie pour le temps que vous m'avez accordé.

Comme convenu, vous trouverez ci-dessous nos documents de présentation :
{documents}

Je reste à votre disposition pour étudier ensemble vos besoins en recrutement et vous proposer une solution adaptée.

Bien cordialement,

{signature}`;

export function signature(moi) {
  return [
    [moi.prenom, moi.nom].filter(Boolean).join(' '),
    moi.fonction,
    moi.societe,
    moi.tel_mobile && `Mobile : ${moi.tel_mobile}`,
    moi.tel_fixe && `Tél : ${moi.tel_fixe}`,
    moi.email,
    moi.site,
  ].filter(Boolean).join('\n');
}

// ---------- Ouverture d'un email dans la messagerie choisie (Réglages) ----------
export const MESSAGERIES = {
  outlook: 'Outlook (application)',
  outlook_web: 'Outlook sur le web (navigateur)',
  gmail: 'Gmail',
  defaut: "Messagerie par défaut de l'appareil",
};
const estMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function lienEmail({ a = '', sujet = '', corps = '' }, messagerie = 'outlook') {
  const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  // Application Outlook du téléphone ; sur ordinateur, Outlook reçoit les liens « mailto » s'il est la messagerie par défaut
  if (messagerie === 'outlook' && estMobile()) return `ms-outlook://compose?${q({ to: a, subject: sujet, body: corps })}`;
  if (messagerie === 'outlook_web') return `https://outlook.office.com/mail/deeplink/compose?${q({ to: a, subject: sujet, body: corps })}`;
  if (messagerie === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&${q({ to: a, su: sujet, body: corps })}`;
  return `mailto:${encodeURIComponent(a).replace(/%40/g, '@')}?${q({ subject: sujet, body: corps })}`;
}

export function ouvrirEmail(message, messagerie) {
  const lien = lienEmail(message, messagerie);
  if (lien.startsWith('https:')) window.open(lien, '_blank', 'noopener');
  else location.href = lien;
}

export function emailSuivi(p, moi, documents) {
  const docs = documents.length
    ? documents.map((d) => `- ${d.titre} : ${d.url_publique}`).join('\n')
    : '- (aucun document pour le moment)';
  const corps = (moi.modele_email || MODELE_EMAIL_DEFAUT)
    .replaceAll('{prenom}', p.prenom || '')
    .replaceAll('{nom}', p.nom || '')
    .replaceAll('{societe}', p.societe || '')
    .replaceAll('{salon}', p.salon ? ` lors de « ${p.salon} »` : '')
    .replaceAll('{documents}', docs)
    .replaceAll('{signature}', signature(moi))
    .replace(/Bonjour ,/, 'Bonjour,');
  const sujet = `${moi.societe || 'Intérim Qualité'} – suite à notre rencontre${p.salon ? ` (${p.salon})` : ''}`;
  return { a: p.email || '', sujet, corps };
}

// ============================================================
//  Exports
// ============================================================
const ETAPES = { nouveau: 'Nouveau', a_relancer: 'À relancer', rdv: 'RDV planifié', proposition: 'Proposition envoyée', client: 'Client', perdu: 'Perdu' };
const TEMPERATURES = { chaud: 'Chaud', tiede: 'Tiède', froid: 'Froid' };
export { ETAPES, TEMPERATURES };

// CSV lisible directement par Excel en français (séparateur « ; », accents conservés)
export function exportExcel(prospects, echangesDe) {
  const colonnes = [
    ['Date de rencontre', (p) => p.date_rencontre],
    ['Salon', (p) => p.salon],
    ['Prénom', (p) => p.prenom],
    ['Nom', (p) => p.nom],
    ['Fonction', (p) => p.fonction],
    ['Société', (p) => p.societe],
    ['SIREN', (p) => p.siren],
    ['Email', (p) => p.email],
    ['Mobile', (p) => telLisible(p.tel_mobile)],
    ['Fixe', (p) => telLisible(p.tel_fixe)],
    ['Site', (p) => p.site],
    ['Adresse', (p) => p.adresse],
    ['Code postal', (p) => p.code_postal],
    ['Ville', (p) => p.ville],
    ['Étape', (p) => ETAPES[p.etape] || p.etape],
    ['Température', (p) => TEMPERATURES[p.temperature] || ''],
    ['Besoins', (p) => (p.besoins || []).join(', ')],
    ['Relance', (p) => (p.relance_at && !p.relance_faite ? new Date(p.relance_at).toLocaleString('fr-FR') : '')],
    ['Motif relance', (p) => (p.relance_faite ? '' : p.relance_motif)],
    ['SIRET', (p) => p.entreprise?.siret],
    ["Secteur d'activité", (p) => secteurDe(p.entreprise)],
    ['Code NAF', (p) => p.entreprise?.naf],
    ['Libellé NAF', (p) => p.entreprise?.naf_libelle || p.entreprise?.activite],
    ['Dirigeant principal', (p) => dirigeantDe(p.entreprise)],
    ['Effectif', (p) => p.entreprise?.effectif],
    ["Chiffre d'affaires", (p) => p.entreprise?.ca ?? ''],
    ['Dirigeants', (p) => (p.entreprise?.dirigeants || []).map((d) => `${d.nom} (${d.qualite})`).join(', ')],
    ['Notes', (p) => p.notes],
    ['Dernier compte rendu', (p) => echangesDe(p.id)[0]?.contenu],
  ];
  const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lignes = [colonnes.map(([t]) => cellule(t)).join(';')];
  for (const p of prospects) lignes.push(colonnes.map(([, f]) => cellule(f(p))).join(';'));
  return new Blob(['\uFEFF' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function exportVCards(prospects) {
  const tout = prospects
    .map((p) => creerVCard({ ...p, site: p.site && urlComplete(p.site), note: [p.salon && `Rencontré(e) : ${p.salon}`].filter(Boolean).join('') }))
    .join('\r\n');
  return new Blob([tout], { type: 'text/vcard;charset=utf-8' });
}
