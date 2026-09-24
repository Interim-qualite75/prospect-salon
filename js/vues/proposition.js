// Proposition commerciale : le générateur « generateur_propositions.html » intégré à l'app.
// Pré-rempli depuis la fiche, réglages habituels mémorisés, enregistré, envoyé au prospect
// (email ou QR code en direct, lien privé temporaire) et « Bon pour accord » signé à l'écran.

import { supabase, etat, profil, enregistrerProfil, enregistrer, listePropositions, listeTaches, nouvelId } from '../donnees.js';
import { $, $$, esc, icone, toast, modale, confirmer, nomComplet, telecharger, partagerFichier } from '../ui.js';
import { pleinEcran } from './partager.js';
import { dateDansJours } from './taches.js';

const HTML2PDF = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';

export const STATUTS = { brouillon: 'Brouillon', envoyee: 'Envoyée', acceptee: 'Acceptée', refusee: 'Refusée' };
const CLASSE_STATUT = { brouillon: '', envoyee: 'bleu', acceptee: 'vert', refusee: 'retard' };
export const pastilleStatut = (s) => `<span class="pastille ${CLASSE_STATUT[s] || ''}">${STATUTS[s] || s}</span>`;

// ---------- Valeurs de départ (reprises du générateur) ----------
const DEFAUTS = {
  clientNom: '', clientAdresse: '', clientSiret: '', faitA: 'Paris', dateProposition: '', numeroDevis: '', validiteJours: 30,
  needs: [''],
  delaiMiseADispo: 5, includeGarantie: true, delaiRemplacement: 48, includeNonSollicitation: true, dureeNonSollicitation: 6,
  includeVivier: true,
  vivierTexte: "Notre vivier d'intérimaires qualifiés est mobilisable rapidement sur le secteur. Nous accompagnons déjà plusieurs entreprises en Île-de-France, dont nous pouvons partager les références sur demande.",
  mode: 'auto', chargesPct: 52, margePct: 28,
  paliers: [
    { min: 11.88, max: 12.5, marge: 28, coef: null, manual: false },
    { min: 12.5, max: 14, marge: 30.8, coef: null, manual: false },
    { min: 14, max: null, marge: 33.5, coef: null, manual: false },
  ],
  tauxRef: '12.31',
  coefIndemnites: 1.02, periodicite: 'Mensuelle', reglement: 'À réception', modePaiement: 'Virement bancaire',
  penalitesRetard: "3 fois le taux d'intérêt légal en vigueur", indemniteRecouvrement: 40,
  includeFraisDossier: false, fraisDossierMontant: '100', fraisDossierCustom: '',
  includeGrilleHoraire: true, includeForfait: false, forfaitIntitule: '', forfaitMontant: 0, forfaitTva: 20,
  includeFormation: false, formationIntitule: '', formationStagiaires: 1, formationDuree: '', formationTarifType: 'stagiaire',
  formationMontant: 0, formationLieu: '',
  dateDebut: '', dureeMois: 12, renouvellement: 'tacite', preavisMois: 1,
  cgLibres: 'En cas de dénonciation ou de non-renouvellement, les dispositions de cette Convention resteront applicables aux contrats en cours.',
  interlocAgence: 'Intérim Qualité Paris — Île-de-France', interlocNom: '', interlocFonction: '', interlocEmail: '', interlocTel: '',
  interlocAdresse: '', agenceSiret: '',
  includeGroupe: true,
  groupeTexte: "Intérim Qualité est une entité du Groupe IP, fondée en 2001 et implantée sur les grands bassins industriels français. Le groupe est constitué de 4 enseignes : Travail Temporaire, Travail Temporaire d'Insertion, Conseil RH et Formation, Cabinet de recrutement. Nos équipes, agiles et réactives, placent la qualité et la prévention des risques professionnels au cœur de leur démarche (certifications MASE et CEFRI).",
  includeCGV: true,
  cgvTexte: `Facturation : les prestations sont facturées mensuellement sur la base des relevés d'heures signés par le client, selon les taux et coefficients définis dans la présente proposition.
Réserve : Intérim Qualité se réserve le droit de refuser ou d'interrompre une mission en cas de non-respect des conditions de sécurité par l'entreprise utilisatrice.
Responsabilité : la responsabilité d'Intérim Qualité est limitée aux obligations légales de l'entreprise de travail temporaire ; l'entreprise utilisatrice reste responsable des conditions d'exécution du travail (sécurité, encadrement, matériel).
Réclamations : toute réclamation relative à une facture doit être formulée par écrit dans un délai de 15 jours suivant sa réception, au-delà duquel elle est réputée acceptée.
Protection des données : les données transmises dans le cadre de cette proposition sont traitées conformément au RGPD et ne sont utilisées qu'aux fins de la relation commerciale et du placement de personnel.
Litiges : à défaut de règlement amiable, tout litige relève de la compétence exclusive des tribunaux du ressort du siège social d'Intérim Qualité.`,
  signature: null,
};

// Ce qui est mémorisé d'une proposition à l'autre (comme le faisait le générateur)
const HABITUELS = [
  'interlocAgence', 'interlocNom', 'interlocFonction', 'interlocEmail', 'interlocTel', 'interlocAdresse', 'agenceSiret',
  'chargesPct', 'margePct', 'mode', 'paliers', 'coefIndemnites', 'reglement', 'periodicite', 'modePaiement', 'penalitesRetard',
  'indemniteRecouvrement', 'cgLibres', 'groupeTexte', 'includeGroupe', 'cgvTexte', 'includeCGV', 'vivierTexte', 'includeVivier',
  'delaiMiseADispo', 'includeGarantie', 'delaiRemplacement', 'includeNonSollicitation', 'dureeNonSollicitation', 'faitA',
  'validiteJours', 'dureeMois', 'renouvellement', 'preavisMois',
];
const BESOINS_GENERIQUES = ['intérim', 'interim', 'cdd', 'cdi', 'formation', 'recrutement'];

// ---------- Calculs et mises en forme (repris du générateur) ----------
const fmt2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const coefDe = (s, p) => (p.manual && p.coef != null ? p.coef : (1 + (Number(s.chargesPct) || 0) / 100) * (1 + (Number(p.marge) || 0) / 100));
const dateFR = (d) => (d ? new Date(typeof d === 'string' ? `${d.slice(0, 10)}T00:00:00` : d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
function ajouterMois(date, mois) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  d.setMonth(d.getMonth() + (parseInt(mois, 10) || 0));
  return d;
}
const aujourdhui = () => dateDansJours(0);

function numeroSuivant() {
  const annee = new Date().getFullYear();
  const deja = listePropositions()
    .map((x) => x.numero?.match(new RegExp(`^IQP-${annee}-(\\d+)$`))?.[1])
    .filter(Boolean).map(Number);
  return `IQP-${annee}-${String((deja.length ? Math.max(...deja) : 0) + 1).padStart(3, '0')}`;
}

function adresseClient(p) {
  const e = p.entreprise || {};
  if (e.adresse) return /\d{5}/.test(e.adresse) ? e.adresse : [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  return [p.adresse, [p.code_postal, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
}

// Nouvelle proposition : réglages habituels + fiche du prospect + mes coordonnées
function etatInitial(p) {
  const moi = profil();
  const habituels = moi.proposition_reglages || {};
  const besoins = (p.besoins || []).filter((b) => !BESOINS_GENERIQUES.includes(b.toLowerCase()));
  return structuredClone({
    ...DEFAUTS,
    interlocNom: nomComplet(moi),
    interlocFonction: moi.fonction || '',
    interlocEmail: moi.email || '',
    interlocTel: [moi.tel_fixe, moi.tel_mobile].filter(Boolean).join(' / '),
    interlocAdresse: [moi.adresse, [moi.code_postal, moi.ville].filter(Boolean).join(' ')].filter(Boolean).join(' - '),
    ...habituels,
    clientNom: p.entreprise?.nom || p.societe || '',
    clientAdresse: adresseClient(p),
    clientSiret: p.entreprise?.siret || '',
    needs: besoins.length ? besoins : [''],
    numeroDevis: numeroSuivant(),
    dateProposition: aujourdhui(),
    dateDebut: aujourdhui(),
    signature: null,
  });
}

// ---------- Le document (repris de renderPreview du générateur) ----------
export function documentHtml(s) {
  const client = esc(s.clientNom || '[Société]');
  const dateProp = dateFR(s.dateProposition);
  const dateFin = s.dateDebut ? dateFR(ajouterMois(s.dateDebut, s.dureeMois)) : '';
  const renouv = s.renouvellement === 'tacite' ? 'Elle se renouvellera ensuite par tacite reconduction, par année civile.'
    : s.renouvellement === 'accord' ? "Elle pourra ensuite être renouvelée d'un commun accord par année civile."
      : 'Elle est conclue pour une durée ferme et ne se renouvellera pas automatiquement.';
  const cgv = String(s.cgvTexte || '').split('\n').filter((l) => l.trim()).map((l) => {
    const i = l.indexOf(' : ');
    return i > -1 ? `<p><strong>${esc(l.slice(0, i))} :</strong>${esc(l.slice(i + 2))}</p>` : `<p>${esc(l)}</p>`;
  }).join('');
  const besoins = (s.needs || []).filter((n) => n.trim()).map((n) => `<li>${esc(n)}</li>`).join('');
  const paliers = (s.paliers || []).map((p, i) => {
    const c = coefDe(s, p);
    const tranche = p.max != null && p.max !== '' ? `${fmt2(p.min)} à ${fmt2(p.max)}` : `${fmt2(p.min)} et +`;
    return `<tr><td>${i + 1} (Coeff ${fmt2(c)})</td><td>${tranche}</td><td>x ${fmt2(c)}</td></tr>`;
  }).join('');
  const frais = s.fraisDossierMontant === 'custom' ? Number(s.fraisDossierCustom) || 0 : Number(s.fraisDossierMontant) || 0;
  const forfaitHt = Number(s.forfaitMontant) || 0;
  const forfaitTtc = forfaitHt * (1 + (Number(s.forfaitTva) || 0) / 100);
  const formationMontant = Number(s.formationMontant) || 0;
  const formationTotal = s.formationTarifType === 'stagiaire' ? formationMontant * (Number(s.formationStagiaires) || 1) : formationMontant;
  const sig = s.signature;

  return `
    <div class="cover">
      <p class="cover-eyebrow">${esc(s.interlocAgence)} — Groupe IP</p>
      <h1 class="cover-title">Prestation commerciale</h1>
      <p class="cover-sub">Travail temporaire et recrutement</p>
      <div class="cover-client">
        <div class="label">Pour la société</div>
        <div class="name">${client}</div>
        ${s.clientAdresse ? `<div class="addr">Siège social : ${esc(s.clientAdresse)}</div>` : ''}
        ${s.clientSiret ? `<div class="addr">SIRET : ${esc(s.clientSiret)}</div>` : ''}
      </div>
      <div class="cover-meta">
        ${s.numeroDevis ? `Proposition n° ${esc(s.numeroDevis)}<br>` : ''}
        Fait à ${esc(s.faitA)}${dateProp ? `, le ${dateProp}` : ''}${s.validiteJours ? ` — offre valable ${esc(s.validiteJours)} jours` : ''}<br>
        <strong>${esc(s.interlocNom)}</strong> — ${esc(s.interlocFonction)}<br>
        ${esc(s.interlocEmail)} — ${esc(s.interlocTel)}
      </div>
    </div>

    ${s.includeGroupe ? `<section><h3>${esc(s.interlocAgence)}</h3><p>${esc(s.groupeTexte)}</p></section>` : ''}

    <section>
      <h3>1. Vos besoins</h3>
      <p>Dans le cadre de l'accompagnement et du développement de ses activités, ${client} a recours aux services des agences d'emploi pour ses besoins de recrutement et le renfort temporaire de ses équipes.</p>
      ${besoins ? `<p>Les principales qualifications concernées sont les suivantes :</p><ul>${besoins}</ul>` : ''}
    </section>

    <section>
      <h3>2. Nos engagements</h3>
      <ul>
        <li>Mise à disposition du personnel sous <strong>${esc(s.delaiMiseADispo)} jours ouvrés</strong> après validation de la commande.</li>
        ${s.includeGarantie ? `<li><strong>Garantie de remplacement :</strong> en cas d'absence ou d'inadéquation du salarié intérimaire, un remplacement est proposé sous ${esc(s.delaiRemplacement)}h.</li>` : ''}
        ${s.includeNonSollicitation ? `<li><strong>Non-sollicitation :</strong> l'entreprise utilisatrice s'engage à ne pas embaucher directement, sans l'accord d'Intérim Qualité, un salarié intérimaire placé chez elle, pendant une durée de ${esc(s.dureeNonSollicitation)} mois après la fin de la mission, sauf application des dispositions légales en vigueur.</li>` : ''}
      </ul>
      ${s.includeVivier ? `<p>${esc(s.vivierTexte)}</p>` : ''}
    </section>

    <section>
      <h3>3. Notre proposition tarifaire</h3>
      ${s.includeGrilleHoraire ? `
        <table class="tarif"><thead><tr><th>Palier</th><th>Taux brut (€)</th><th>Tarif facturé</th></tr></thead><tbody>${paliers}</tbody></table>
        <p>Les coefficients ci-dessus comprennent les congés payés ainsi que les charges sociales, fiscales et parafiscales ayant pour assiette le salaire. Ces tarifs sont révisables en cas de variation des charges sociales ou fiscales en vigueur.</p>
        <p><strong>Indemnités non soumises :</strong> application d'un coefficient ${esc(s.coefIndemnites)}.</p>` : ''}
      ${s.includeForfait ? `
        <table class="tarif"><thead><tr><th>Prestation</th><th>Montant HT</th><th>Montant TTC (TVA ${esc(s.forfaitTva)}%)</th></tr></thead>
          <tbody><tr><td>${esc(s.forfaitIntitule || 'Prestation forfaitaire')}</td><td>${fmt2(forfaitHt)} €</td><td>${fmt2(forfaitTtc)} €</td></tr></tbody></table>` : ''}
      ${s.includeFraisDossier ? `<p><strong>Frais de dossier :</strong> ${fmt2(frais)} € HT, facturés à l'ouverture du dossier.</p>` : ''}
      <p><strong>Facturation :</strong> périodicité ${esc(String(s.periodicite).toLowerCase())}, conditions de règlement ${esc(String(s.reglement).toLowerCase())}, par ${esc(String(s.modePaiement).toLowerCase())}.</p>
      <p><strong>Retard de paiement :</strong> toute somme non réglée à l'échéance porte de plein droit intérêt à un taux égal à ${esc(s.penalitesRetard)}, sans qu'un rappel soit nécessaire, et donne lieu à une indemnité forfaitaire pour frais de recouvrement de ${esc(s.indemniteRecouvrement)} €.</p>
    </section>

    ${s.includeFormation ? `
      <section>
        <h3>Formation</h3>
        <p><strong>${esc(s.formationIntitule || 'Intitulé de la formation')}</strong>${s.formationDuree ? ` — ${esc(s.formationDuree)}` : ''}</p>
        <p>Nombre de stagiaires : ${esc(s.formationStagiaires)}${s.formationLieu ? ` — Lieu : ${esc(s.formationLieu)}` : ''}</p>
        <p><strong>Tarif :</strong> ${fmt2(formationMontant)} € HT ${s.formationTarifType === 'stagiaire' ? 'par stagiaire' : '(forfait session)'}, soit <strong>${fmt2(formationTotal)} € HT</strong> au total.</p>
      </section>` : ''}

    <section>
      <h3>4. Durée de la convention</h3>
      <p>La présente Convention prend effet le <strong>${s.dateDebut ? dateFR(s.dateDebut) : "[date d'effet]"}</strong> et est applicable à tous les détachements de personnel effectués à compter de sa mise en application, et ce jusqu'au <strong>${dateFin || '[date de fin]'}</strong>.</p>
      <p>${renouv} ${esc(s.cgLibres)}</p>
      <p>Le délai réciproque de dénonciation est de ${esc(s.preavisMois)} mois, par lettre recommandée avec accusé de réception.</p>
    </section>

    ${s.includeCGV ? `<section><h3>5. Conditions générales de vente</h3>${cgv}</section>` : ''}

    <section class="bon-accord">
      <h3>Bon pour accord</h3>
      <p>Vos interlocuteurs Intérim Qualité restent à votre disposition pour vous apporter tout renseignement complémentaire, et vous remercient de bien vouloir nous retourner un exemplaire de cette offre revêtue de votre signature et du cachet de votre société.</p>
      <p>Fait à : ${esc(s.faitA)}${dateProp ? ` — Le ${dateProp}` : ''}</p>
      <div class="footer-sign">
        <div class="box"><strong>Pour Intérim Qualité</strong><br>${esc(s.interlocNom)}</div>
        <div class="box"><strong>Votre entreprise</strong><br>
          ${sig ? `Nom : ${esc(sig.nom)}<br>Fonction : ${esc(sig.fonction)}<br>Bon pour accord, signé le ${dateFR(sig.date)}<br>
            <img class="signature" src="${esc(sig.image)}" alt="Signature">` : 'Nom :<br>Fonction :<br>Cachet / Signature :'}
        </div>
      </div>
    </section>

    <div class="interloc">
      <strong>${esc(s.interlocAgence)}</strong>${s.agenceSiret ? ` — SIRET ${esc(s.agenceSiret)}` : ''}<br>
      ${esc(s.interlocNom)} — ${esc(s.interlocFonction)}<br>
      ${esc(s.interlocEmail)} — ${esc(s.interlocTel)}<br>
      ${esc(s.interlocAdresse)}
    </div>`;
}

// ---------- Exports ----------
function chargerHtml2pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = HTML2PDF;
    sc.onload = () => ok(window.html2pdf);
    sc.onerror = () => ko(new Error('Création du PDF indisponible (pas de connexion ?)'));
    document.head.append(sc);
  });
}

// Le PDF est fabriqué à partir d'une copie hors écran, pour ne pas dépendre de l'onglet affiché
export async function versPdf(s) {
  const html2pdf = await chargerHtml2pdf();
  const hote = document.createElement('div');
  hote.className = 'impression-proposition';
  // html2pdf recopie l'élément ailleurs : la mise en page A4 doit donc porter sur .doc-prop.impression lui-même
  hote.innerHTML = `<div class="doc-prop impression">${documentHtml(s)}</div>`;
  document.body.append(hote);
  try {
    return await html2pdf().set({
      margin: [0, 0, 10, 0],
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'li', 'h3', '.footer-sign', '.interloc'] },
    }).from(hote.firstElementChild).outputPdf('blob');
  } finally {
    hote.remove();
  }
}

// Vrai document Word (.docx) : A4, couverture sur sa propre page, titres, tableau tarifaire,
// signature intégrée et pied de page numéroté — lisible tel quel par le client.
const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.7.2/+esm';
export async function versWord(s) {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    BorderStyle, Footer, PageNumber, ShadingType, TableLayoutType,
  } = await import(DOCX);
  const BLEU = '006FB8', BLEU_FONCE = '234670', MARINE = '1B243E', GRIS = '5B6577', TRAIT = 'DCE2E8', TEXTE = '22293A';
  const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), color: TEXTE, ...o });
  // « **gras** : suite » → morceaux gras / normal
  const riche = (morceaux, o = {}) => morceaux.filter(([x]) => x !== '' && x != null).map(([x, gras]) => t(x, { bold: !!gras, ...o }));
  const para = (enfants, o = {}) => new Paragraph({ spacing: { after: 120, line: 300 }, ...o, children: Array.isArray(enfants) ? enfants : [t(enfants)] });
  const puce = (enfants) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 290 }, children: Array.isArray(enfants) ? enfants : [t(enfants)] });
  const titre = (texte) => new Paragraph({
    keepNext: true,
    spacing: { before: 280, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TRAIT, space: 4 } },
    children: [t(texte.toUpperCase(), { bold: true, color: BLEU_FONCE, size: 22, characterSpacing: 20 })],
  });
  const vide = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });
  const bord = { style: BorderStyle.SINGLE, size: 4, color: TRAIT };
  const bords = { top: bord, bottom: bord, left: bord, right: bord };
  const cellule = (enfants, o = {}) => new TableCell({
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: bords,
    ...o,
    children: Array.isArray(enfants) ? enfants : [para([t(enfants)], { spacing: { after: 0 } })],
  });
  const entete = (x) => cellule([para([t(x.toUpperCase(), { bold: true, color: 'FFFFFF', size: 17 })], { spacing: { after: 0 } })],
    { shading: { type: ShadingType.CLEAR, fill: BLEU, color: 'auto' } });
  const tableau = (titres, lignes) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: titres.map(entete) }),
      ...lignes.map((l, i) => new TableRow({
        cantSplit: true,
        children: l.map((x) => cellule(x, i % 2 ? { shading: { type: ShadingType.CLEAR, fill: 'F8FAFB', color: 'auto' } } : {})),
      })),
    ],
  });

  // Mêmes calculs que l'aperçu
  const dateProp = dateFR(s.dateProposition);
  const dateFin = s.dateDebut ? dateFR(ajouterMois(s.dateDebut, s.dureeMois)) : '';
  const client = s.clientNom || '[Société]';
  const frais = s.fraisDossierMontant === 'custom' ? Number(s.fraisDossierCustom) || 0 : Number(s.fraisDossierMontant) || 0;
  const forfaitHt = Number(s.forfaitMontant) || 0;
  const forfaitTtc = forfaitHt * (1 + (Number(s.forfaitTva) || 0) / 100);
  const formationMontant = Number(s.formationMontant) || 0;
  const formationTotal = s.formationTarifType === 'stagiaire' ? formationMontant * (Number(s.formationStagiaires) || 1) : formationMontant;
  const renouv = s.renouvellement === 'tacite' ? 'Elle se renouvellera ensuite par tacite reconduction, par année civile.'
    : s.renouvellement === 'accord' ? "Elle pourra ensuite être renouvelée d'un commun accord par année civile."
      : 'Elle est conclue pour une durée ferme et ne se renouvellera pas automatiquement.';

  // ---- Couverture (page 1) ----
  const centre = (enfants, o = {}) => para(enfants, { alignment: AlignmentType.CENTER, ...o });
  const couverture = [
    vide(1800),
    centre([t(`${s.interlocAgence} — Groupe IP`.toUpperCase(), { bold: true, color: '7A9A2E', size: 18, characterSpacing: 40 })], { spacing: { after: 360 } }),
    centre([t('Prestation commerciale', { bold: true, color: MARINE, size: 56 })], { spacing: { after: 120 } }),
    centre([t('Travail temporaire et recrutement', { color: GRIS, size: 28 })], { spacing: { after: 900 } }),
    new Table({
      width: { size: 70, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [new TableRow({ children: [new TableCell({
        margins: { top: 240, bottom: 240, left: 300, right: 300 },
        borders: { top: { style: BorderStyle.SINGLE, size: 12, color: BLEU }, bottom: bord, left: bord, right: bord },
        children: [
          centre([t('POUR LA SOCIÉTÉ', { bold: true, color: BLEU, size: 16, characterSpacing: 30 })], { spacing: { after: 80 } }),
          centre([t(client, { bold: true, color: MARINE, size: 34 })], { spacing: { after: 80 } }),
          ...(s.clientAdresse ? [centre([t(`Siège social : ${s.clientAdresse}`, { color: GRIS, size: 18 })], { spacing: { after: 40 } })] : []),
          ...(s.clientSiret ? [centre([t(`SIRET : ${s.clientSiret}`, { color: GRIS, size: 18 })], { spacing: { after: 0 } })] : []),
        ],
      })] })],
    }),
    vide(900),
    ...(s.numeroDevis ? [centre([t(`Proposition n° ${s.numeroDevis}`, { color: GRIS })], { spacing: { after: 60 } })] : []),
    centre([t(`Fait à ${s.faitA}${dateProp ? `, le ${dateProp}` : ''}${s.validiteJours ? ` — offre valable ${s.validiteJours} jours` : ''}`, { color: GRIS })], { spacing: { after: 60 } }),
    centre([t(s.interlocNom, { bold: true }), t(` — ${s.interlocFonction}`, { color: GRIS })], { spacing: { after: 60 } }),
    centre([t(`${s.interlocEmail} — ${s.interlocTel}`, { color: GRIS })]),
  ];

  // ---- Corps ----
  const corps = [];
  if (s.includeGroupe) corps.push(titre(s.interlocAgence), para(s.groupeTexte));
  corps.push(titre('1. Vos besoins'),
    para(`Dans le cadre de l'accompagnement et du développement de ses activités, ${client} a recours aux services des agences d'emploi pour ses besoins de recrutement et le renfort temporaire de ses équipes.`));
  const besoins = (s.needs || []).filter((n) => n.trim());
  if (besoins.length) corps.push(para('Les principales qualifications concernées sont les suivantes :'), ...besoins.map((n) => puce(n)));

  corps.push(titre('2. Nos engagements'),
    puce(riche([['Mise à disposition du personnel sous '], [`${s.delaiMiseADispo} jours ouvrés`, true], [' après validation de la commande.']])));
  if (s.includeGarantie) corps.push(puce(riche([['Garantie de remplacement : ', true], [`en cas d'absence ou d'inadéquation du salarié intérimaire, un remplacement est proposé sous ${s.delaiRemplacement}h.`]])));
  if (s.includeNonSollicitation) corps.push(puce(riche([['Non-sollicitation : ', true], [`l'entreprise utilisatrice s'engage à ne pas embaucher directement, sans l'accord d'Intérim Qualité, un salarié intérimaire placé chez elle, pendant une durée de ${s.dureeNonSollicitation} mois après la fin de la mission, sauf application des dispositions légales en vigueur.`]])));
  if (s.includeVivier) corps.push(para(s.vivierTexte));

  corps.push(titre('3. Notre proposition tarifaire'));
  if (s.includeGrilleHoraire) {
    corps.push(tableau(['Palier', 'Taux brut (€)', 'Tarif facturé'], (s.paliers || []).map((pl, i) => {
      const c = coefDe(s, pl);
      return [`${i + 1} (Coeff ${fmt2(c)})`, pl.max != null && pl.max !== '' ? `${fmt2(pl.min)} à ${fmt2(pl.max)}` : `${fmt2(pl.min)} et +`, `x ${fmt2(c)}`];
    })), vide(80),
    para('Les coefficients ci-dessus comprennent les congés payés ainsi que les charges sociales, fiscales et parafiscales ayant pour assiette le salaire. Ces tarifs sont révisables en cas de variation des charges sociales ou fiscales en vigueur.'),
    para(riche([['Indemnités non soumises : ', true], [`application d'un coefficient ${s.coefIndemnites}.`]])));
  }
  if (s.includeForfait) {
    corps.push(tableau(['Prestation', 'Montant HT', `Montant TTC (TVA ${s.forfaitTva} %)`],
      [[s.forfaitIntitule || 'Prestation forfaitaire', `${fmt2(forfaitHt)} €`, `${fmt2(forfaitTtc)} €`]]), vide(80));
  }
  if (s.includeFraisDossier) corps.push(para(riche([['Frais de dossier : ', true], [`${fmt2(frais)} € HT, facturés à l'ouverture du dossier.`]])));
  corps.push(
    para(riche([['Facturation : ', true], [`périodicité ${String(s.periodicite).toLowerCase()}, conditions de règlement ${String(s.reglement).toLowerCase()}, par ${String(s.modePaiement).toLowerCase()}.`]])),
    para(riche([['Retard de paiement : ', true], [`toute somme non réglée à l'échéance porte de plein droit intérêt à un taux égal à ${s.penalitesRetard}, sans qu'un rappel soit nécessaire, et donne lieu à une indemnité forfaitaire pour frais de recouvrement de ${s.indemniteRecouvrement} €.`]])),
  );

  if (s.includeFormation) {
    corps.push(titre('Formation'),
      para(riche([[s.formationIntitule || 'Intitulé de la formation', true], [s.formationDuree ? ` — ${s.formationDuree}` : '']])),
      para(`Nombre de stagiaires : ${s.formationStagiaires}${s.formationLieu ? ` — Lieu : ${s.formationLieu}` : ''}`),
      para(riche([['Tarif : ', true], [`${fmt2(formationMontant)} € HT ${s.formationTarifType === 'stagiaire' ? 'par stagiaire' : '(forfait session)'}, soit `], [`${fmt2(formationTotal)} € HT`, true], [' au total.']])));
  }

  corps.push(titre('4. Durée de la convention'),
    para(riche([['La présente Convention prend effet le '], [s.dateDebut ? dateFR(s.dateDebut) : "[date d'effet]", true],
      [" et est applicable à tous les détachements de personnel effectués à compter de sa mise en application, et ce jusqu'au "], [dateFin || '[date de fin]', true], ['.']])),
    para(`${renouv} ${s.cgLibres || ''}`.trim()),
    para(`Le délai réciproque de dénonciation est de ${s.preavisMois} mois, par lettre recommandée avec accusé de réception.`));

  if (s.includeCGV) {
    corps.push(titre('5. Conditions générales de vente'));
    for (const l of String(s.cgvTexte || '').split('\n').filter((x) => x.trim())) {
      const i = l.indexOf(' : ');
      corps.push(para(i > -1 ? riche([[`${l.slice(0, i)} : `, true], [l.slice(i + 3)]], { size: 19 }) : [t(l, { size: 19 })]));
    }
  }

  // ---- Bon pour accord + signatures ----
  const sig = s.signature;
  let image = null;
  if (sig?.image) {
    const octets = Uint8Array.from(atob(sig.image.split(',')[1]), (c) => c.charCodeAt(0));
    image = new ImageRun({ type: 'png', data: octets, transformation: { width: 180, height: 60 } });
  }
  const pointille = { style: BorderStyle.DASHED, size: 6, color: 'B7C1CC' };
  const boite = (enfants) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 160, bottom: 160, left: 200, right: 200 },
    borders: { top: pointille, bottom: pointille, left: pointille, right: pointille },
    children: enfants,
  });
  corps.push(titre('Bon pour accord'),
    para("Vos interlocuteurs Intérim Qualité restent à votre disposition pour vous apporter tout renseignement complémentaire, et vous remercient de bien vouloir nous retourner un exemplaire de cette offre revêtue de votre signature et du cachet de votre société.", { keepNext: true }),
    para(`Fait à : ${s.faitA}${dateProp ? ` — Le ${dateProp}` : ''}`, { keepNext: true }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, height: { value: 2000, rule: 'atLeast' }, children: [
        boite([para([t('Pour Intérim Qualité', { bold: true })], { spacing: { after: 60 } }), para(s.interlocNom), para(s.interlocFonction)]),
        boite(sig
          ? [para([t('Votre entreprise', { bold: true })], { spacing: { after: 60 } }), para(`Nom : ${sig.nom}`), para(`Fonction : ${sig.fonction || ''}`),
            para(`Bon pour accord, signé le ${dateFR(sig.date)}`), ...(image ? [para([image], { spacing: { after: 0 } })] : [])]
          : [para([t('Votre entreprise', { bold: true })], { spacing: { after: 60 } }), para('Nom :'), para('Fonction :'), para('Cachet / Signature :')]),
      ] })],
    }));

  const pied = new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: TRAIT, space: 6 } },
    children: [
      t(`${s.interlocAgence}${s.agenceSiret ? ` — SIRET ${s.agenceSiret}` : ''} · ${s.interlocAdresse} · ${s.interlocEmail}`, { size: 15, color: GRIS }),
      new TextRun({ children: ['   —   Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 15, color: GRIS }),
    ],
  })] });
  const page = { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134, footer: 500 } };

  const d = new Document({
    creator: s.interlocNom || 'Intérim Qualité',
    title: `Proposition commerciale ${s.numeroDevis || ''} – ${client}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21, color: TEXTE } } } },
    sections: [
      { properties: { page }, children: couverture },
      { properties: { page }, footers: { default: pied }, children: corps },
    ],
  });
  return Packer.toBlob(d);
}

const nomFichier = (s, ext) => `Proposition_${(s.numeroDevis || '')}_${(s.clientNom || 'client')}`.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '') + `.${ext}`;

// ---------- Formulaire ----------
const ch = (k, libelle, s, { type = 'text', step = '', ph = '' } = {}) => `
  <label class="champ"><span>${libelle}</span>
    <input data-k="${k}" type="${type}" ${step ? `step="${step}"` : ''} value="${esc(s[k] ?? '')}" placeholder="${esc(ph)}"></label>`;
const coche = (k, libelle, s) => `
  <label class="ligne-coche"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}> ${libelle}</label>`;
const zone = (k, libelle, s, lignes = 3) => `
  <label class="champ"><span>${libelle}</span><textarea data-k="${k}" rows="${lignes}">${esc(s[k] ?? '')}</textarea></label>`;
const liste = (k, libelle, s, options) => `
  <label class="champ"><span>${libelle}</span><select data-k="${k}">${options.map(([v, l]) =>
    `<option value="${esc(v)}" ${String(s[k]) === String(v) ? 'selected' : ''}>${esc(l ?? v)}</option>`).join('')}</select></label>`;
const bloc = (titre, contenu, ouvert = false) => `<details class="carte bloc-prop" ${ouvert ? 'open' : ''}><summary>${titre}</summary><div class="pile-s">${contenu}</div></details>`;

function formulaire(s) {
  return `
    ${bloc('Client', `
      ${ch('clientNom', 'Société', s)}
      ${ch('clientAdresse', 'Adresse du siège', s)}
      ${ch('clientSiret', 'SIRET client', s, { ph: '14 chiffres' })}
      <div class="grille-2">${ch('faitA', 'Fait à', s)}${ch('dateProposition', 'Date de la proposition', s, { type: 'date' })}</div>
      <div class="grille-2">${ch('numeroDevis', 'N° de proposition', s)}${ch('validiteJours', 'Offre valable (jours)', s, { type: 'number' })}</div>`, true)}
    ${bloc('Besoins du client', `<div id="besoins-prop" class="pile-s"></div>
      <button type="button" class="btn petit" id="ajout-besoin">${icone('plus')} Ajouter une qualification</button>`, true)}
    ${bloc('Engagements complémentaires', `
      ${ch('delaiMiseADispo', 'Délai de mise à disposition (jours ouvrés)', s, { type: 'number' })}
      ${coche('includeGarantie', 'Garantie de remplacement', s)}
      ${ch('delaiRemplacement', 'Délai de remplacement (heures)', s, { type: 'number' })}
      ${coche('includeNonSollicitation', 'Clause de non-sollicitation', s)}
      ${ch('dureeNonSollicitation', 'Durée de la clause après mission (mois)', s, { type: 'number' })}
      ${coche('includeVivier', 'Vivier disponible / références secteur', s)}
      ${zone('vivierTexte', 'Texte', s)}`)}
    ${bloc('Coefficients et grille tarifaire', `
      <div class="puces"><button type="button" class="puce" data-mode="auto" aria-pressed="${s.mode === 'auto'}">Calcul automatique</button>
        <button type="button" class="puce" data-mode="manuel" aria-pressed="${s.mode === 'manuel'}">Saisie manuelle</button></div>
      <div id="params-auto" ${s.mode === 'manuel' ? 'hidden' : ''}>
        <div class="grille-2">${ch('chargesPct', 'Charges sociales, fiscales et CP (%)', s, { type: 'number', step: '0.1' })}
          ${ch('margePct', 'Marge commerciale visée (%)', s, { type: 'number', step: '0.1' })}</div>
        <p class="tres-discret">Coefficient = (1 + charges) × (1 + marge). Tapez directement un coefficient pour le figer en manuel sur ce palier.</p>
      </div>
      <div class="table-defile"><table class="paliers"><thead><tr><th>Palier</th><th>Brut min (€)</th><th>Brut max (€)</th><th>Marge %</th><th>Coefficient</th><th></th></tr></thead>
        <tbody id="paliers-prop"></tbody></table></div>
      <div class="grille-2">${liste('tauxRef', 'Nouveau palier à partir de', s, [
        ['12.31', 'SMIC horaire brut — 12,31 €'], ['12.93', 'SMIC +5 % — 12,93 €'], ['13.54', 'SMIC +10 % — 13,54 €'],
        ['14.16', 'SMIC +15 % — 14,16 €'], ['14.77', 'SMIC +20 % — 14,77 €'], ['15.39', 'SMIC +25 % — 15,39 €'], ['custom', 'Suite du dernier palier']])}
        <div class="champ"><span>&nbsp;</span><button type="button" class="btn petit" id="ajout-palier">${icone('plus')} Ajouter un palier</button></div></div>`)}
    ${bloc('Paramètres de facturation', `
      <div class="grille-2">${ch('coefIndemnites', 'Coefficient indemnités non soumises', s, { type: 'number', step: '0.01' })}
        ${liste('periodicite', 'Périodicité de facturation', s, [['Mensuelle'], ['Hebdomadaire'], ['À la mission']])}</div>
      <div class="grille-2">${liste('reglement', 'Conditions de règlement', s, [['À réception'], ['30 jours net'], ['30 jours fin de mois'], ['45 jours fin de mois'], ['60 jours fin de mois']])}
        ${liste('modePaiement', 'Mode de paiement', s, [['Virement bancaire'], ['Prélèvement automatique'], ['Chèque'], ['Traite'], ['Virement bancaire ou chèque']])}</div>
      <div class="grille-2">${ch('penalitesRetard', 'Pénalités de retard', s)}${ch('indemniteRecouvrement', 'Indemnité forfaitaire de recouvrement (€)', s, { type: 'number' })}</div>
      ${coche('includeFraisDossier', 'Frais de dossier', s)}
      <div class="grille-2">${liste('fraisDossierMontant', 'Montant', s, [['0', '0 €'], ['50', '50 €'], ['75', '75 €'], ['100', '100 €'], ['150', '150 €'], ['200', '200 €'], ['custom', 'Personnalisé']])}
        ${ch('fraisDossierCustom', 'Montant personnalisé (€)', s, { type: 'number' })}</div>`)}
    ${bloc('Mode de facturation', `
      ${coche('includeGrilleHoraire', 'Grille horaire (coefficients)', s)}
      ${coche('includeForfait', 'Ajouter un forfait HT (prestation ponctuelle, recrutement…)', s)}
      ${ch('forfaitIntitule', 'Intitulé de la prestation forfaitaire', s, { ph: 'ex. Prestation de recrutement CDI' })}
      <div class="grille-2">${ch('forfaitMontant', 'Montant HT (€)', s, { type: 'number' })}${ch('forfaitTva', 'TVA (%)', s, { type: 'number' })}</div>`)}
    ${bloc('Formation (si facturée)', `
      ${coche('includeFormation', 'Inclure une prestation de formation', s)}
      ${ch('formationIntitule', 'Intitulé de la formation', s)}
      <div class="grille-2">${ch('formationStagiaires', 'Nombre de stagiaires', s, { type: 'number' })}${ch('formationDuree', 'Durée', s, { ph: 'ex. 2 jours (14h)' })}</div>
      <div class="grille-2">${liste('formationTarifType', 'Tarif', s, [['stagiaire', 'Par stagiaire (€ HT)'], ['forfait', 'Forfait session (€ HT)']])}
        ${ch('formationMontant', 'Montant (€ HT)', s, { type: 'number' })}</div>
      ${ch('formationLieu', 'Lieu de formation', s)}`)}
    ${bloc('Durée de la convention', `
      <div class="grille-2">${ch('dateDebut', "Date d'effet", s, { type: 'date' })}${ch('dureeMois', 'Durée (mois)', s, { type: 'number' })}</div>
      <div class="grille-2">${liste('renouvellement', 'Renouvellement', s, [['tacite', 'Tacite reconduction par année civile'], ['accord', "Renouvelable d'un commun accord"], ['ferme', 'Durée ferme, non renouvelable']])}
        ${ch('preavisMois', 'Préavis de dénonciation (mois)', s, { type: 'number' })}</div>
      ${zone('cgLibres', 'Conditions générales complémentaires', s, 3)}`)}
    ${bloc('Interlocuteur Intérim Qualité', `
      ${ch('interlocAgence', 'Agence', s)}
      <div class="grille-2">${ch('interlocNom', 'Nom', s)}${ch('interlocFonction', 'Fonction', s)}</div>
      <div class="grille-2">${ch('interlocEmail', 'Email', s)}${ch('interlocTel', 'Téléphone', s)}</div>
      ${ch('interlocAdresse', 'Adresse agence', s)}
      ${ch('agenceSiret', 'SIRET Intérim Qualité Paris', s, { ph: '14 chiffres' })}`)}
    ${bloc('Présentation du Groupe IP', `${coche('includeGroupe', 'Inclure le bloc de présentation du Groupe', s)}${zone('groupeTexte', 'Texte', s, 5)}`)}
    ${bloc('Conditions générales de vente', `${coche('includeCGV', 'Inclure les CGV dans la proposition', s)}${zone('cgvTexte', 'CGV (une clause par ligne, « Titre : texte »)', s, 10)}`)}
    <p class="tres-discret">Vos réglages habituels (coefficients, conditions, CGV, SIRET de l'agence…) sont mémorisés pour la prochaine proposition.</p>`;
}

// ============================================================
export function afficher(vue, params, { aller, titre }) {
  const [prospectId, propositionId] = params;
  const p = etat.prospects.get(prospectId);
  if (!p) {
    vue.innerHTML = `<div class="vide">${icone('alerte')}<p>Ce prospect n'existe plus.</p><a class="btn" href="#/prospects">Retour aux prospects</a></div>`;
    return;
  }
  const existante = propositionId ? etat.propositions.get(propositionId) : null;
  let prop = existante
    ? structuredClone(existante)
    : { id: nouvelId(), prospect_id: p.id, statut: 'brouillon', parametres: etatInitial(p) };
  const s = { ...structuredClone(DEFAUTS), ...prop.parametres };
  let enregistree = !!existante;
  titre(`Proposition ${s.numeroDevis || ''}`.trim());

  vue.innerHTML = `
    <div class="generateur">
      <div class="barre-prop">
        <span id="statut-prop">${pastilleStatut(prop.statut)}</span>
        <span class="discret espace">${esc(nomComplet(p))}${p.societe && p.prenom ? ` · ${esc(p.societe)}` : ''}</span>
        <div class="ligne">
          <button class="btn petit primaire" id="envoyer">${icone('envoyer')} Envoyer au prospect</button>
          <button class="btn petit" id="signer">${icone('crayon')} Faire signer</button>
          <button class="btn petit" id="pdf">${icone('telecharger')} PDF</button>
          <button class="btn petit" id="word">${icone('telecharger')} Word</button>
          <select id="changer-statut" class="btn petit" aria-label="Statut">${Object.entries(STATUTS).map(([k, v]) =>
            `<option value="${k}" ${prop.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
      </div>
      <div class="puces onglets-prop" role="tablist">
        <button class="puce" data-onglet="saisie" aria-pressed="true">Remplir</button>
        <button class="puce" data-onglet="apercu" aria-pressed="false">Aperçu</button>
      </div>
      <div class="colonnes-prop" data-onglet-actif="saisie">
        <form class="saisie-prop pile-s" id="form-prop" novalidate>${formulaire(s)}</form>
        <div class="apercu-prop"><div class="doc-prop" id="doc-prop"></div></div>
      </div>
    </div>`;

  const form = $('#form-prop', vue);
  const doc = $('#doc-prop', vue);
  const majApercu = () => (doc.innerHTML = documentHtml(s));

  // Enregistrement automatique (brouillon) et mémorisation des réglages habituels
  let minuteur;
  const sauver = () => {
    prop = enregistrer('propositions', { ...prop, numero: s.numeroDevis, parametres: structuredClone(s) });
    enregistree = true;
  };
  const programmerSauvegarde = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      sauver();
      enregistrerProfil({ proposition_reglages: Object.fromEntries(HABITUELS.map((k) => [k, s[k]])) });
    }, 1200);
  };
  const changement = () => {
    majApercu();
    programmerSauvegarde();
  };

  const saisie = (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'chargesPct') dessinerPaliers();
    changement();
  };
  form.addEventListener('input', saisie);
  form.addEventListener('change', (e) => e.target.type === 'checkbox' && saisie(e));

  // Besoins
  const dessinerBesoins = () => {
    $('#besoins-prop', vue).innerHTML = s.needs.map((n, i) => `
      <div class="ligne"><input class="espace" data-besoin="${i}" value="${esc(n)}" placeholder="Qualification (ex. Caristes CACES 3)">
        <button type="button" class="btn-icone" data-retirer="${i}" aria-label="Retirer">${icone('x')}</button></div>`).join('');
  };
  $('#besoins-prop', vue).addEventListener('input', (e) => {
    const i = e.target.dataset.besoin;
    if (i == null) return;
    s.needs[Number(i)] = e.target.value;
    changement();
  });
  $('#besoins-prop', vue).addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer]');
    if (!b) return;
    s.needs.splice(Number(b.dataset.retirer), 1);
    dessinerBesoins();
    changement();
  });
  $('#ajout-besoin', vue).addEventListener('click', () => {
    s.needs.push('');
    dessinerBesoins();
    $$('[data-besoin]', vue).at(-1)?.focus();
  });

  // Paliers et coefficients
  function dessinerPaliers() {
    $('#paliers-prop', vue).innerHTML = s.paliers.map((pl, i) => `
      <tr><td>${i + 1}</td>
        <td><input type="number" step="0.01" value="${pl.min ?? ''}" data-f="min" data-i="${i}"></td>
        <td><input type="number" step="0.01" value="${pl.max ?? ''}" placeholder="et +" data-f="max" data-i="${i}"></td>
        <td><input type="number" step="0.1" value="${pl.marge ?? 0}" data-f="marge" data-i="${i}" ${pl.manual ? 'disabled' : ''}></td>
        <td><input type="number" step="0.01" value="${fmt2(coefDe(s, pl))}" data-f="coef" data-i="${i}" class="coef">${pl.manual ? '<small>manuel</small>' : ''}</td>
        <td><button type="button" class="btn-icone" data-retirer-palier="${i}" aria-label="Retirer le palier">${icone('x')}</button></td></tr>`).join('');
  }
  $('#paliers-prop', vue).addEventListener('change', (e) => {
    const { f, i } = e.target.dataset;
    if (!f) return;
    const pl = s.paliers[Number(i)];
    const v = e.target.value === '' ? null : parseFloat(e.target.value);
    if (f === 'min' || f === 'max') pl[f] = v;
    if (f === 'marge') { pl.marge = v || 0; pl.manual = false; }
    if (f === 'coef') { pl.coef = v || 0; pl.manual = true; }
    dessinerPaliers();
    changement();
  });
  $('#paliers-prop', vue).addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer-palier]');
    if (!b) return;
    s.paliers.splice(Number(b.dataset.retirerPalier), 1);
    dessinerPaliers();
    changement();
  });
  $('#ajout-palier', vue).addEventListener('click', () => {
    const dernier = s.paliers.at(-1);
    const depart = s.tauxRef === 'custom' ? dernier?.max ?? 0 : parseFloat(s.tauxRef);
    s.paliers.push({ min: dernier?.max ?? depart, max: null, marge: dernier?.marge ?? 25, coef: null, manual: false });
    if (s.tauxRef !== 'custom' && !dernier) s.paliers.at(-1).min = depart;
    dessinerPaliers();
    changement();
  });
  $$('[data-mode]', vue).forEach((b) => b.addEventListener('click', () => {
    s.mode = b.dataset.mode;
    s.paliers.forEach((pl) => (pl.manual = s.mode === 'manuel'));
    $$('[data-mode]', vue).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#params-auto', vue).hidden = s.mode === 'manuel';
    dessinerPaliers();
    changement();
  }));

  // Onglets (téléphone)
  $$('[data-onglet]', vue).forEach((b) => b.addEventListener('click', () => {
    $('.colonnes-prop', vue).dataset.ongletActif = b.dataset.onglet;
    $$('[data-onglet]', vue).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    window.scrollTo(0, 0);
  }));

  // Statut choisi à la main (ex. Refusée)
  $('#changer-statut', vue).addEventListener('change', (e) => {
    prop.statut = e.target.value;
    sauver();
    $('#statut-prop', vue).innerHTML = pastilleStatut(prop.statut);
    toast(`Proposition « ${STATUTS[prop.statut]} »`, 'ok');
  });

  const occupe = async (bouton, action) => {
    bouton.disabled = true;
    try {
      await action();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'erreur');
    } finally {
      bouton.disabled = false;
    }
  };
  $('#pdf', vue).addEventListener('click', (e) => occupe(e.currentTarget, async () => {
    toast('Création du PDF…');
    telecharger(await versPdf(s), nomFichier(s, 'pdf'));
  }));
  $('#word', vue).addEventListener('click', (e) => occupe(e.currentTarget, async () => {
    telecharger(await versWord(s), nomFichier(s, 'docx'));
  }));

  const miseAJour = (champs) => {
    prop = { ...prop, ...champs };
    sauver();
    $('#statut-prop', vue).innerHTML = pastilleStatut(prop.statut);
    $('#changer-statut', vue).value = prop.statut;
  };
  $('#envoyer', vue).addEventListener('click', (e) => occupe(e.currentTarget, () => envoyer(p, s, prop, miseAJour)));
  $('#signer', vue).addEventListener('click', async () => {
    if (!(await faireSigner(p, s))) return;
    majApercu();
    miseAJour({ statut: 'acceptee', signee_at: s.signature.date, signataire: `${s.signature.nom}${s.signature.fonction ? `, ${s.signature.fonction}` : ''}` });
    if (p.etape !== 'client') enregistrer('prospects', { ...p, etape: 'client' });
    toast('Bon pour accord signé : le prospect passe en « Client »', 'ok');
    if (await confirmer('Envoyer maintenant la copie signée au client (email ou QR code) ?', { ok: 'Envoyer' })) {
      await occupe($('#envoyer', vue), () => envoyer(p, s, prop, miseAJour));
    }
  });

  dessinerBesoins();
  dessinerPaliers();
  majApercu();

  // En quittant : dernier enregistrement si une modification est en attente
  return async () => {
    if (minuteur) {
      clearTimeout(minuteur);
      sauver();
    }
    return true;
  };
}

// ---------- Envoi au prospect ----------
async function envoyer(p, s, prop, miseAJour) {
  if (!navigator.onLine) throw new Error('Pas de réseau : l’envoi sera possible au retour de la connexion');
  toast('Préparation de la proposition…');
  const pdf = await versPdf(s);
  const chemin = `${etat.utilisateur.id}/${prop.id}.pdf`;
  const { error } = await supabase.storage.from('propositions').upload(chemin, pdf, { upsert: true, contentType: 'application/pdf' });
  if (error) throw new Error(`Envoi du PDF impossible : ${error.message}`);
  const jours = Math.max(1, Number(s.validiteJours) || 30);
  const { data, error: e2 } = await supabase.storage.from('propositions')
    .createSignedUrl(chemin, jours * 86400, { download: nomFichier(s, 'pdf') });
  if (e2) throw new Error(`Lien impossible : ${e2.message}`);
  const lien = data.signedUrl;
  const finValidite = new Date(Date.now() + jours * 86400000).toLocaleDateString('fr-FR');

  // Suivi : statut, étape du prospect, tâche de relance à 7 jours
  miseAJour({ statut: prop.statut === 'brouillon' ? 'envoyee' : prop.statut, envoyee_at: new Date().toISOString(), pdf_chemin: chemin });
  const q = etat.prospects.get(p.id) || p;
  if (!['proposition', 'client'].includes(q.etape)) enregistrer('prospects', { ...q, etape: 'proposition' });
  const titreRelance = `Relancer la proposition ${s.numeroDevis}`;
  if (!s.signature && !listeTaches({ prospectId: p.id }).some((t) => t.titre === titreRelance)) {
    enregistrer('taches', { prospect_id: p.id, titre: titreRelance, priorite: 'normale', echeance: dateDansJours(7), faite: false });
  }

  const moi = profil();
  const sujet = `Proposition commerciale ${s.numeroDevis} – Intérim Qualité`;
  const corps = [
    `Bonjour${p.prenom ? ` ${p.prenom}` : ''},`,
    '',
    s.signature
      ? `Veuillez trouver ci-dessous votre exemplaire signé de notre proposition commerciale n° ${s.numeroDevis}.`
      : `Suite à notre échange, veuillez trouver notre proposition commerciale n° ${s.numeroDevis}${s.clientNom ? ` pour ${s.clientNom}` : ''}.`,
    '',
    `Télécharger la proposition (PDF) : ${lien}`,
    `(lien valable jusqu'au ${finValidite})`,
    '',
    'Je reste à votre disposition pour en échanger.',
    '',
    'Bien cordialement,',
    nomComplet(moi),
    [moi.fonction, moi.societe].filter(Boolean).join(' – '),
    [moi.tel_mobile, moi.tel_fixe].filter(Boolean).join(' / '),
  ].join('\n');

  let dejaNote = false;
  await modale({
    titre: 'Envoyer la proposition',
    contenu: `
      <p class="discret">${icone('ok')} Proposition ${esc(s.numeroDevis)} prête. Le lien est privé et reste valable jusqu'au <b>${esc(finValidite)}</b>.</p>
      <div class="pile-s">
        <button type="button" class="btn primaire large" data-envoi="qr">${icone('qr')} QR code en direct (le client scanne)</button>
        <button type="button" class="btn large" data-envoi="email">${icone('mail')} Email avec le lien${p.email ? ` à ${esc(p.email)}` : ''}</button>
        <button type="button" class="btn large" data-envoi="partage">${icone('partager')} Envoyer le PDF (Mail, Outlook, WhatsApp…)</button>
        <button type="button" class="btn fantome large" data-envoi="copier">${icone('fichier')} Copier le lien</button>
      </div>
      <p class="tres-discret">Une tâche « ${esc(titreRelance)} » est prévue dans 7 jours.</p>`,
    onOuvert: (dlg) => dlg.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-envoi]');
      if (!b) return;
      const choix = b.dataset.envoi;
      const premierEnvoi = !dejaNote;
      dejaNote = true;
      if (choix === 'qr') pleinEcran([{ texteQR: lien, titre: `Proposition ${s.numeroDevis}`, type: 'document' }]);
      if (choix === 'email') location.href = `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      if (choix === 'partage') await partagerFichier(pdf, nomFichier(s, 'pdf'), corps);
      if (choix === 'copier') {
        await navigator.clipboard.writeText(lien);
        toast('Lien copié', 'ok');
      }
      if (premierEnvoi) {
        const moyen = { qr: 'par QR code', email: 'par email', partage: 'en PDF', copier: 'par lien' }[choix];
        enregistrer('echanges', { prospect_id: p.id, type: 'document', contenu: `Proposition ${s.numeroDevis} envoyée ${moyen}${s.signature ? ' (exemplaire signé)' : ''}`, date_echange: new Date().toISOString() });
      }
    }),
  });
}

// ---------- Bon pour accord signé à l'écran ----------
async function faireSigner(p, s) {
  let signe = false;
  const { valeur, dlg } = await modale({
    titre: 'Bon pour accord',
    large: true,
    contenu: `
      <p>Proposition <b>${esc(s.numeroDevis)}</b> pour <b>${esc(s.clientNom || '')}</b>.</p>
      <p class="tres-discret">En signant, le client donne son accord sur la proposition commerciale et les conditions qu'elle contient.</p>
      <div class="grille-2">
        <label class="champ"><span>Nom du signataire</span><input name="nom" value="${esc(nomComplet(p) === p.societe ? '' : nomComplet(p))}" autocomplete="off"></label>
        <label class="champ"><span>Fonction</span><input name="fonction" value="${esc(p.fonction || '')}" autocomplete="off"></label>
      </div>
      <div class="champ"><span>Signature (avec le doigt ou la souris)</span>
        <canvas class="zone-signature" width="900" height="300" aria-label="Zone de signature"></canvas></div>
      <button type="button" class="btn petit fantome" id="effacer-signature">${icone('x')} Effacer</button>
      <p class="tres-discret" id="erreur-signature" role="alert"></p>`,
    actions: [
      { libelle: 'Annuler', valeur: 'non', classe: 'secondaire' },
      { libelle: `${icone('ok')} Valider la signature`, valeur: 'ok', classe: 'primaire' },
    ],
    onOuvert: (d) => {
      const c = d.querySelector('canvas');
      const x = c.getContext('2d');
      x.lineWidth = 4;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.strokeStyle = '#1b243e';
      let dessin = false;
      const point = (e) => {
        const r = c.getBoundingClientRect();
        return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
      };
      c.addEventListener('pointerdown', (e) => {
        dessin = true;
        c.setPointerCapture(e.pointerId);
        x.beginPath();
        x.moveTo(...point(e));
      });
      c.addEventListener('pointermove', (e) => {
        if (!dessin) return;
        x.lineTo(...point(e));
        x.stroke();
        signe = true;
      });
      c.addEventListener('pointerup', () => (dessin = false));
      d.querySelector('#effacer-signature').addEventListener('click', () => {
        x.clearRect(0, 0, c.width, c.height);
        signe = false;
      });
      d.querySelector('form').addEventListener('submit', (e) => {
        if (e.submitter?.value !== 'ok') return;
        const manque = !signe ? 'Le client doit signer dans le cadre.' : !d.querySelector('[name=nom]').value.trim() ? 'Indiquez le nom du signataire.' : '';
        if (manque) {
          e.preventDefault();
          d.querySelector('#erreur-signature').textContent = manque;
        }
      });
    },
  });
  if (valeur !== 'ok') return false;
  s.signature = {
    image: dlg.querySelector('canvas').toDataURL('image/png'),
    nom: dlg.querySelector('[name=nom]').value.trim(),
    fonction: dlg.querySelector('[name=fonction]').value.trim(),
    date: new Date().toISOString(),
  };
  return true;
}
