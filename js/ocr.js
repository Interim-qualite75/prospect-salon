// Lecture des cartes de visite.
// - Gratuit : Tesseract (lecture dans l'appareil) + règles pour reconnaître chaque champ.
// - Option IA : Claude lit la photo et renvoie directement les champs (plus fiable).

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

// ---------- Préparation de la photo ----------
export async function chargerImage(fichier) {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' }).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(fichier);
    await img.decode();
    return img;
  });
  return bitmap;
}

export function redimensionner(image, max, { niveauxDeGris = false, contraste = 1 } = {}) {
  const l = image.width, h = image.height;
  const r = Math.min(1, max / Math.max(l, h));
  const c = document.createElement('canvas');
  c.width = Math.round(l * r);
  c.height = Math.round(h * r);
  const ctx = c.getContext('2d');
  if (niveauxDeGris) ctx.filter = `grayscale(1) contrast(${contraste})`;
  ctx.drawImage(image, 0, 0, c.width, c.height);
  return c;
}

export const canvasEnBlob = (c, qualite = 0.82) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', qualite));

// ---------- Lecture gratuite (Tesseract) ----------
let travailleur;
function chargerTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = TESSERACT;
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => ko(new Error('Lecture de carte indisponible (pas de connexion ?)'));
    document.head.append(s);
  });
}

export async function lireTexte(image, surProgression = () => {}) {
  const Tesseract = await chargerTesseract();
  if (!travailleur) {
    surProgression(0.05, 'Préparation de la lecture…');
    travailleur = await Tesseract.createWorker(['fra', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') surProgression(0.3 + m.progress * 0.7, 'Lecture de la carte…');
        else if (m.status?.startsWith('loading')) surProgression(0.05 + (m.progress || 0) * 0.25, 'Préparation de la lecture…');
      },
    });
  }
  const canvas = redimensionner(image, 2000, { niveauxDeGris: true, contraste: 1.3 });
  const { data } = await travailleur.recognize(canvas);
  surProgression(1, 'Terminé');
  return data.text || '';
}

// ---------- Reconnaissance des champs dans le texte lu ----------
const MOTS_FONCTION =
  /\b(directeur|directrice|dirigeant|dirigeante|g[ée]rante?|pr[ée]sidente?|p\.?d\.?g|ceo|coo|cfo|cto|drh|rh|ressources humaines|responsable|manager|chef|charg[ée]e?|assistante?|attach[ée]e?|commercial|commerciale|conseill[eè]re?|consultante?|ing[ée]nieur|technicien|technicienne|comptable|fondat(eur|rice)|co-?fondat(eur|rice)|associ[ée]e?|head|sales|business|developer|d[ée]veloppeur|account|recruteur|recruteuse|coordinat(eur|rice)|superviseur|agent|d[ée]l[ée]gu[ée]e?|secr[ée]taire|office|acheteur|acheteuse|achats|logistique|planificat(eur|rice)|conducteur de travaux|op[ée]rations?)\b/i;
const POSTES =
  /\b(directeur|directrice|dirigeante?|g[ée]rante?|pr[ée]sidente?|p\.?d\.?g|ceo|coo|cfo|cto|drh|daf|responsable|manager|chef|charg[ée]e?|assistante?|attach[ée]e?|conseill[eè]re?|consultante?|ing[ée]nieure?|technicien(ne)?|comptable|fondat(eur|rice)|associ[ée]e?|head of|recruteu(r|se)|coordinat(eur|rice)|superviseu(r|se)|d[ée]l[ée]gu[ée]e?|secr[ée]taire|acheteu(r|se)|commerciale?)\b/i;
const FORME_JURIDIQUE = /\b(SAS|SASU|SARL|EURL|SA|SNC|SCOP|SCI|SELARL|GIE)\b/;
const FORMES = /\b(SAS|SASU|SARL|EURL|SA|SNC|SCOP|SCI|SELARL|GIE|GROUPE|GROUP|HOLDING|INTERNATIONAL|FRANCE|INDUSTRIES?|SERVICES?|SOLUTIONS?|CONSEIL|TRANSPORTS?|LOGISTIQUE|CONSTRUCTION|BTP)\b/;
const RUE = /\b(\d{1,4}\s*(bis|ter)?[\s,]+)?(rue|avenue|av\.?|bd|boulevard|all[ée]e|chemin|route|place|quai|impasse|cours|zi|za|zac|parc|rond[- ]point|voie|lieu[- ]dit|b[âa]timent|bp|cs)\b/i;
const DOMAINES_GENERIQUES = /^(gmail|yahoo|hotmail|outlook|live|orange|free|wanadoo|sfr|laposte|icloud|me|aol|protonmail|bbox|neuf)$/i;

const nettoyer = (s) => s.replace(/[|•·©®™_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const majusculeInitiale = (s) =>
  s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function telephones(texte) {
  const res = [];
  const re = /(?:(?:\+|00)\s?33\s?\(?0?\)?\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g;
  for (const ligne of texte.split('\n')) {
    const estFax = /fax|t[ée]l[ée]copie/i.test(ligne);
    for (const m of ligne.matchAll(re)) {
      let t = m[0].replace(/[^\d+]/g, '');
      if (t.startsWith('0033')) t = '+33' + t.slice(4);
      if (t.startsWith('+330')) t = '+33' + t.slice(4);
      const national = t.startsWith('+33') ? '0' + t.slice(3) : t;
      if (!estFax) res.push({ national, mobile: /^0[67]/.test(national), ligne });
    }
  }
  return res;
}

const formaterTel = (t) => t.replace(/(\d{2})(?=\d)/g, '$1 ');

export function analyserTexte(texte) {
  const lignes = texte.split('\n').map(nettoyer).filter((l) => l.length > 1);
  const r = {};
  const utilisees = new Set();

  const email = texte.match(/[A-Z0-9._%+-]+\s?@\s?[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.replace(/\s/g, '');
  if (email) r.email = email.toLowerCase();

  const site = texte.match(/\b(?:https?:\/\/)?(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i)?.[0];
  if (site) r.site = site.toLowerCase().replace(/^https?:\/\//, '');
  else if (r.email) {
    const dom = r.email.split('@')[1];
    if (!DOMAINES_GENERIQUES.test(dom.split('.')[0])) r.site = 'www.' + dom;
  }

  const tels = telephones(texte);
  const mobile = tels.find((t) => t.mobile);
  const fixe = tels.find((t) => !t.mobile);
  if (mobile) r.tel_mobile = formaterTel(mobile.national);
  if (fixe) r.tel_fixe = formaterTel(fixe.national);
  tels.forEach((t) => utilisees.add(t.ligne));

  // Adresse : ligne avec code postal + ville, et la ligne rue juste avant.
  // Sur les cartes en deux colonnes, l'adresse partage la ligne avec un téléphone : on retire les numéros.
  const sansTel = (l) =>
    l.replace(/\b(t[ée]l[ée]?phone|t[ée]l|mob(ile)?|port(able)?|fax|standard|ligne directe|t|m|p|f)?\.?\s*:?\s*(?:(?:\+|00)\s?33\s?\(?0?\)?\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/gi, ' ')
      .replace(/\s{2,}/g, ' ').trim();
  const adresses = lignes.map(sansTel);
  const iCp = adresses.findIndex((l) => /\b\d{5}\b\s+[A-Za-zÀ-ÿ'-]{2,}/.test(l) && !/@|www\./i.test(l));
  if (iCp >= 0) {
    const m = adresses[iCp].match(/(.*?)\b(\d{5})\s+([A-Za-zÀ-ÿ' -]+?)(?:\s+cedex.*)?$/i);
    if (m) {
      r.code_postal = m[2];
      r.ville = majusculeInitiale(m[3].trim());
      const avant = m[1].replace(/[,\s-]+$/, '').trim();
      if (avant && RUE.test(avant)) r.adresse = avant;
      else if (iCp > 0 && RUE.test(adresses[iCp - 1])) {
        r.adresse = adresses[iCp - 1];
        utilisees.add(lignes[iCp - 1]);
      }
    }
    utilisees.add(lignes[iCp]);
  } else {
    const i = adresses.findIndex((l) => RUE.test(l) && /\d/.test(l));
    if (i >= 0) {
      r.adresse = adresses[i];
      utilisees.add(lignes[i]);
    }
  }

  const libres = lignes.filter(
    (l) => !utilisees.has(l) && !/@|www\.|https?:|\d{2}[\s.]\d{2}[\s.]\d{2}/i.test(l),
  );

  // Nom : d'abord grâce à l'email (prenom.nom@), sinon une ligne de 2-3 mots sans chiffre
  const local = r.email?.split('@')[0] || '';
  const morceaux = local.split(/[._-]/).filter((x) => x.length > 1);
  let ligneNom = null;
  if (morceaux.length >= 2) {
    ligneNom = libres.find((l) => morceaux.every((m) => l.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(m)));
  }
  if (!ligneNom) {
    ligneNom = libres.find(
      (l) =>
        /^[\p{Lu}][\p{L}'-]+(\s+[\p{L}'-]+){1,2}$/u.test(l) &&
        !MOTS_FONCTION.test(l) &&
        !FORMES.test(l) &&
        l.length < 40,
    );
  }
  if (ligneNom) {
    const mots = ligneNom.split(/\s+/);
    // Le mot tout en majuscules est souvent le nom de famille
    const iMaj = mots.findIndex((m) => m.length > 1 && m === m.toUpperCase());
    if (iMaj > 0) {
      r.prenom = majusculeInitiale(mots.slice(0, iMaj).join(' '));
      r.nom = mots.slice(iMaj).join(' ').toUpperCase();
    } else if (iMaj === 0 && mots.length > 1) {
      r.nom = mots[0].toUpperCase();
      r.prenom = majusculeInitiale(mots.slice(1).join(' '));
    } else {
      r.prenom = majusculeInitiale(mots[0]);
      r.nom = mots.slice(1).join(' ').toUpperCase();
    }
    utilisees.add(ligneNom);
  }

  // Fonction : d'abord les intitulés de poste sûrs, jamais une ligne qui porte une forme juridique
  const candidates = libres.filter((l) => !utilisees.has(l) && !FORME_JURIDIQUE.test(l) && l.length < 70);
  const ligneFonction = candidates.find((l) => POSTES.test(l)) || candidates.find((l) => MOTS_FONCTION.test(l) && l !== l.toUpperCase());
  if (ligneFonction) {
    r.fonction = ligneFonction;
    utilisees.add(ligneFonction);
  }

  // Société : forme juridique, ou ligne en majuscules, ou le nom de domaine de l'email
  let societe = libres.find((l) => !utilisees.has(l) && FORMES.test(l) && l.length < 50);
  societe ??= libres.find((l) => !utilisees.has(l) && l.length > 2 && l.length < 40 && l === l.toUpperCase() && /[A-Z]{2,}/.test(l));
  if (!societe && r.email) {
    const dom = r.email.split('@')[1].split('.')[0];
    if (!DOMAINES_GENERIQUES.test(dom)) {
      // « Agro Plus » écrit sur la carte correspond au domaine agroplus.com : on garde l'écriture de la carte
      const compacte = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
      societe = libres.find((l) => !utilisees.has(l) && compacte(l) === compacte(dom)) || dom.replace(/[-_]/g, ' ').toUpperCase();
    }
  }
  if (societe) r.societe = societe;

  return r;
}

// ---------- QR code imprimé sur la carte (gratuit, sans réseau une fois chargé) ----------
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

function chargerJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = JSQR;
    s.onload = () => ok(window.jsQR);
    s.onerror = () => ko(new Error('Lecteur de QR code indisponible'));
    document.head.append(s);
  });
}

// Renvoie le texte du QR code trouvé sur la photo, ou '' s'il n'y en a pas.
// On essaie deux tailles : un petit QR se lit mieux en grand, un QR flou mieux en petit.
export async function lireQR(image) {
  const jsQR = await chargerJsQR().catch(() => null);
  if (!jsQR) return '';
  for (const taille of [1600, 900]) {
    const c = redimensionner(image, taille);
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const r = jsQR(data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data.trim();
  }
  return '';
}

function telNational(s) {
  let t = String(s).replace(/[^\d+]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (t.startsWith('+33')) t = '0' + t.slice(3).replace(/^0/, '');
  return /^0\d{9}$/.test(t) ? formaterTel(t) : String(s).trim();
}

function decoderQP(s) {
  const octets = [];
  s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})|([\s\S])/gi, (m, hex, c) => {
    if (hex) octets.push(parseInt(hex, 16));
    else octets.push(...new TextEncoder().encode(c));
  });
  return new TextDecoder().decode(new Uint8Array(octets));
}

const deseche = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;:\\])/g, '$1').trim();

function ajouterTel(r, valeur, types = '') {
  const t = telNational(valeur);
  if (!t || /fax/i.test(types)) return;
  const mobile = /cell|mobile/i.test(types) || /^0[67]/.test(t.replace(/\s/g, ''));
  if (mobile) r.tel_mobile ??= t;
  else r.tel_fixe ??= t;
}

function ajouterLien(r, url) {
  const u = url.trim();
  if (/linkedin\.com/i.test(u)) r.notes = [r.notes, `LinkedIn : ${u}`].filter(Boolean).join('\n');
  else r.site ??= u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function analyserVCard(texte) {
  const r = {};
  const lignes = texte.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  for (const ligne of lignes) {
    const i = ligne.indexOf(':');
    if (i < 0) continue;
    const [nomBrut, ...params] = ligne.slice(0, i).split(';');
    const cle = nomBrut.replace(/^item\d+\./i, '').toUpperCase();
    const p = params.join(';');
    let v = ligne.slice(i + 1);
    if (/QUOTED-PRINTABLE/i.test(p)) v = decoderQP(v);
    if (cle === 'N') {
      const [nom, prenom] = v.split(';').map(deseche);
      if (nom) r.nom = nom.toUpperCase();
      if (prenom) r.prenom = majusculeInitiale(prenom);
    } else if (cle === 'FN' && !r.nom) {
      const mots = deseche(v).split(/\s+/);
      if (mots.length > 1) {
        r.prenom = majusculeInitiale(mots[0]);
        r.nom = mots.slice(1).join(' ').toUpperCase();
      }
    } else if (cle === 'ORG') r.societe = deseche(v.split(';')[0]);
    else if (cle === 'TITLE' || cle === 'ROLE') r.fonction ??= deseche(v);
    else if (cle === 'EMAIL') r.email ??= deseche(v).toLowerCase();
    else if (cle === 'TEL') ajouterTel(r, v.replace(/^tel:/i, ''), p);
    else if (cle === 'URL') ajouterLien(r, deseche(v));
    else if (cle === 'ADR') {
      const [, , rue, ville, , cp] = v.split(';').map(deseche);
      if (rue) r.adresse ??= rue;
      if (ville) r.ville ??= majusculeInitiale(ville);
      if (cp) r.code_postal ??= cp;
    }
  }
  return r;
}

// MECARD:N:NOM,Prénom;TEL:...;EMAIL:...;;
function analyserMeCard(texte) {
  const r = {};
  for (const morceau of texte.replace(/^MECARD:/i, '').split(';')) {
    const i = morceau.indexOf(':');
    if (i < 0) continue;
    const cle = morceau.slice(0, i).toUpperCase();
    const v = deseche(morceau.slice(i + 1));
    if (cle === 'N') {
      const [nom, prenom] = v.split(',').map((x) => x.trim());
      if (nom) r.nom = nom.toUpperCase();
      if (prenom) r.prenom = majusculeInitiale(prenom);
    } else if (cle === 'ORG') r.societe = v;
    else if (cle === 'TITLE') r.fonction = v;
    else if (cle === 'EMAIL') r.email ??= v.toLowerCase();
    else if (cle === 'TEL') ajouterTel(r, v);
    else if (cle === 'URL') ajouterLien(r, v);
    else if (cle === 'ADR') r.adresse ??= v;
  }
  return r;
}

// Transforme le contenu du QR code en champs de fiche
export function analyserQR(texte) {
  if (!texte) return {};
  if (/BEGIN:VCARD/i.test(texte)) return analyserVCard(texte);
  if (/^MECARD:/i.test(texte)) return analyserMeCard(texte);
  if (/^mailto:/i.test(texte)) return { email: texte.slice(7).split('?')[0].toLowerCase() };
  if (/^tel:/i.test(texte)) {
    const r = {};
    ajouterTel(r, texte.slice(4));
    return r;
  }
  if (/^(https?:\/\/|www\.)/i.test(texte)) {
    const r = {};
    ajouterLien(r, texte);
    return r;
  }
  return {};
}

// ---------- Option IA (Claude) ----------
const SCHEMA_CARTE = {
  type: 'object',
  properties: {
    prenom: { type: 'string' },
    nom: { type: 'string' },
    fonction: { type: 'string' },
    societe: { type: 'string' },
    email: { type: 'string' },
    tel_mobile: { type: 'string' },
    tel_fixe: { type: 'string' },
    site: { type: 'string' },
    adresse: { type: 'string' },
    code_postal: { type: 'string' },
    ville: { type: 'string' },
  },
  required: ['prenom', 'nom', 'fonction', 'societe', 'email', 'tel_mobile', 'tel_fixe', 'site', 'adresse', 'code_postal', 'ville'],
  additionalProperties: false,
};

async function clientClaude(cle) {
  const { default: Anthropic } = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm');
  return new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true });
}

function texteReponse(msg) {
  if (msg.stop_reason === 'refusal') throw new Error("L'IA n'a pas pu traiter cette demande");
  if (msg.stop_reason === 'max_tokens') throw new Error("Réponse de l'IA incomplète");
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

export async function lireCarteIA(image, cle) {
  const canvas = redimensionner(image, 1568);
  const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  const client = await clientClaude(cle);
  const msg = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Lecture simple : effort bas = plus rapide et moins cher, sans perte de qualité
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_CARTE } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          {
            type: 'text',
            text:
              "Voici la photo d'une carte de visite professionnelle (France le plus souvent). " +
              "Extrais les coordonnées de la personne. Mets le nom de famille en MAJUSCULES et le prénom avec une majuscule initiale. " +
              'Numéros au format français « 06 12 34 56 78 » : les 06/07 vont dans tel_mobile, les autres dans tel_fixe (ignore le fax). ' +
              "Le site sans https://. L'adresse sans le code postal ni la ville. Laisse une chaîne vide pour tout champ absent de la carte.",
          },
        ],
      },
    ],
  });
  const donnees = JSON.parse(texteReponse(msg));
  return Object.fromEntries(Object.entries(donnees).filter(([, v]) => v && String(v).trim()));
}

// Remet en forme un compte rendu dicté et propose une relance
const SCHEMA_CR = {
  type: 'object',
  properties: {
    compte_rendu: { type: 'string' },
    besoins: { type: 'array', items: { type: 'string' } },
    prochaine_action: { type: 'string' },
    relance_dans_jours: { type: 'integer' },
  },
  required: ['compte_rendu', 'besoins', 'prochaine_action', 'relance_dans_jours'],
  additionalProperties: false,
};

export async function mettreEnFormeCR(texte, contexte, cle) {
  const client = await clientClaude(cle);
  const msg = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: SCHEMA_CR } },
    messages: [
      {
        role: 'user',
        content:
          `Tu aides une responsable d'agence d'intérim (${contexte.societe || 'Intérim Qualité'}) à tenir ses comptes rendus de prospection.\n` +
          `Prospect : ${contexte.prospect}. Type d'échange : ${contexte.type}.\n\n` +
          `Notes dictées (brutes, avec possibles erreurs de dictée) :\n"""${texte}"""\n\n` +
          'Réécris un compte rendu clair et factuel en français (phrases courtes ou puces « - »), sans rien inventer. ' +
          'Liste les besoins identifiés (postes, volumes, période), la prochaine action concrète, ' +
          "et dans combien de jours relancer (0 s'il n'y a rien à relancer).",
      },
    ],
  });
  return JSON.parse(texteReponse(msg));
}
