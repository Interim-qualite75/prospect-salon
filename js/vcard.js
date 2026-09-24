// Génération de fiches contact au format vCard 3.0.
// Le 3.0 est le format le mieux reconnu à la fois par l'appareil photo de
// l'iPhone et par les lecteurs QR Android (Google Lens, Samsung, ZXing).

const echapper = (s) =>
  String(s ?? '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

// 06.07.50.61.13 -> +33607506113 (format international lisible partout)
export function telInternational(tel) {
  if (!tel) return '';
  let t = String(tel).replace(/[^\d+]/g, '');
  if (t.startsWith('0033')) t = '+33' + t.slice(4);
  if (/^0\d{9}$/.test(t)) t = '+33' + t.slice(1);
  return t;
}

// 0607506113 -> 06 07 50 61 13
export function telLisible(tel) {
  if (!tel) return '';
  let t = String(tel).replace(/[^\d+]/g, '');
  if (t.startsWith('+33') && t.length === 12) t = '0' + t.slice(3);
  if (/^0\d{9}$/.test(t)) return t.replace(/(\d{2})(?=\d)/g, '$1 ');
  return String(tel).trim();
}

export function urlComplete(site) {
  if (!site) return '';
  const s = String(site).trim();
  return /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
}

// Plie les lignes longues à 75 caractères (exigé par la norme, utile pour la photo)
const plier = (ligne) => {
  if (ligne.length <= 75) return ligne;
  const morceaux = [ligne.slice(0, 75)];
  for (let i = 75; i < ligne.length; i += 74) morceaux.push(' ' + ligne.slice(i, i + 74));
  return morceaux.join('\r\n');
};

/**
 * @param {object} c  prenom, nom, societe, fonction, tel_mobile, tel_fixe, email,
 *                    adresse, code_postal, ville, site, note
 * @param {object} [options]
 * @param {string} [options.photoBase64]  JPEG en base64 (fichier .vcf uniquement, trop lourd pour un QR)
 */
export function creerVCard(c, { photoBase64 } = {}) {
  const l = ['BEGIN:VCARD', 'VERSION:3.0'];
  l.push(`N:${echapper(c.nom)};${echapper(c.prenom)};;;`);
  l.push(`FN:${echapper([c.prenom, c.nom].filter(Boolean).join(' ') || c.societe)}`);
  if (c.societe) l.push(`ORG:${echapper(c.societe)}`);
  if (c.fonction) l.push(`TITLE:${echapper(c.fonction)}`);
  if (c.tel_mobile) l.push(`TEL;TYPE=CELL:${telInternational(c.tel_mobile)}`);
  if (c.tel_fixe) l.push(`TEL;TYPE=WORK,VOICE:${telInternational(c.tel_fixe)}`);
  if (c.email) l.push(`EMAIL;TYPE=INTERNET,WORK:${String(c.email).trim()}`);
  if (c.adresse || c.ville || c.code_postal) {
    l.push(`ADR;TYPE=WORK:;;${echapper(c.adresse)};${echapper(c.ville)};;${echapper(c.code_postal)};France`);
  }
  if (c.site) l.push(`URL:${urlComplete(c.site)}`);
  if (c.note) l.push(`NOTE:${echapper(c.note)}`);
  if (photoBase64) l.push(plier(`PHOTO;ENCODING=b;TYPE=JPEG:${photoBase64}`));
  l.push('END:VCARD');
  return l.join('\r\n');
}

export function nomFichierVCard(c) {
  const base = [c.prenom, c.nom].filter(Boolean).join(' ') || c.societe || 'contact';
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w -]/g, '').trim() + '.vcf';
}
