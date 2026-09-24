// Recherche d'entreprise.
// 1) La recherche se fait toujours sur l'Annuaire des entreprises de l'État (gratuit, sans limite de crédits).
// 2) Quand on choisit une entreprise et qu'une clé Pappers est enregistrée, on récupère la fiche
//    Pappers complète (1 crédit) : chiffre d'affaires, dirigeants, effectif détaillé…

const API_ETAT = 'https://recherche-entreprises.api.gouv.fr/search';
const API_PAPPERS = 'https://api.pappers.fr/v2';

const EFFECTIFS = {
  NN: 'Non renseigné', '00': '0 salarié', '01': '1 à 2 salariés', '02': '3 à 5 salariés', '03': '6 à 9 salariés',
  11: '10 à 19 salariés', 12: '20 à 49 salariés', 21: '50 à 99 salariés', 22: '100 à 199 salariés',
  31: '200 à 249 salariés', 32: '250 à 499 salariés', 41: '500 à 999 salariés', 42: '1 000 à 1 999 salariés',
  51: '2 000 à 4 999 salariés', 52: '5 000 à 9 999 salariés', 53: '10 000 salariés et plus',
};

const FORMES = {
  1000: 'Entrepreneur individuel', 5202: 'SNC', 5458: 'SCOP (SARL)', 5485: 'SELARL', 5498: 'EURL', 5499: 'SARL',
  5599: 'SA à conseil d’administration', 5699: 'SA à directoire', 5710: 'SAS', 5720: 'SASU', 5785: 'SELAS',
  6540: 'SCI', 6599: 'Société civile', 9220: 'Association',
};
const FORMES_FAMILLE = { 1: 'Entrepreneur individuel', 5: 'Société commerciale', 6: 'Société civile', 7: 'Organisme public', 8: 'Organisme privé', 9: 'Association / groupement' };

const SECTIONS = {
  A: 'Agriculture, sylviculture et pêche', B: 'Industries extractives', C: 'Industrie manufacturière',
  D: "Production et distribution d'énergie", E: 'Eau, assainissement, déchets', F: 'Construction',
  G: 'Commerce, réparation automobile', H: 'Transports et entreposage', I: 'Hébergement et restauration',
  J: 'Information et communication', K: 'Finance et assurance', L: 'Activités immobilières',
  M: 'Activités spécialisées, scientifiques et techniques', N: 'Services administratifs et de soutien',
  O: 'Administration publique', P: 'Enseignement', Q: 'Santé humaine et action sociale',
  R: 'Arts, spectacles et loisirs', S: 'Autres activités de services', T: 'Services aux ménages', U: 'Organisations extraterritoriales',
};

// Section (A…U) d'un code NAF, d'après sa division (2 premiers chiffres)
const DIVISIONS = [[3, 'A'], [9, 'B'], [33, 'C'], [35, 'D'], [39, 'E'], [43, 'F'], [47, 'G'], [53, 'H'], [56, 'I'],
  [63, 'J'], [66, 'K'], [68, 'L'], [75, 'M'], [82, 'N'], [84, 'O'], [85, 'P'], [88, 'Q'], [93, 'R'], [96, 'S'], [98, 'T'], [99, 'U']];
function sectionDepuisNaf(naf) {
  const d = parseInt(naf, 10);
  return Number.isNaN(d) ? '' : DIVISIONS.find(([max]) => d <= max)?.[1] || '';
}

// Secteur d'activité lisible, y compris pour les fiches enregistrées avant l'ajout de ce champ
export const secteurDe = (e) => e?.secteur || SECTIONS[sectionDepuisNaf(e?.naf)] || '';
export const dirigeantDe = (e) => {
  const d = e?.dirigeants?.[0];
  return d ? `${d.nom}${d.qualite ? ` (${d.qualite})` : ''}` : '';
};

// Libellés officiels des codes NAF (liste INSEE, chargée une fois puis gardée hors ligne)
const LISTE_NAF = 'https://cdn.jsdelivr.net/npm/@socialgouv/codes-naf@1.1.1/index.json';
let libellesNaf;
async function chargerLibellesNaf() {
  libellesNaf ??= fetch(LISTE_NAF)
    .then((r) => r.json())
    .then((liste) => new Map(liste.map((x) => [x.id, x.label])))
    .catch(() => {
      libellesNaf = null;   // on réessaiera à la prochaine recherche
      return new Map();
    });
  return libellesNaf;
}

async function avecLibelles(e) {
  const noms = await chargerLibellesNaf();
  return { ...e, naf_libelle: e.naf_libelle || noms.get(e.naf) || '', secteur: secteurDe(e) };
}

// N° de TVA intracommunautaire calculé depuis le SIREN
export function tvaDepuisSiren(siren) {
  if (!/^\d{9}$/.test(siren || '')) return '';
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, '0')}${siren}`;
}

const majuscules = (s) => (s || '').replace(/\s+/g, ' ').trim();

function depuisEtat(r) {
  const s = r.siege || {};
  const fin = r.finances ? Object.entries(r.finances).sort(([a], [b]) => b.localeCompare(a))[0] : null;
  return {
    source: 'Annuaire des entreprises',
    siren: r.siren,
    siret: s.siret,
    nom: majuscules(r.nom_complet || r.nom_raison_sociale),
    forme_juridique: FORMES[r.nature_juridique] || FORMES_FAMILLE[String(r.nature_juridique || '')[0]] || '',
    naf: r.activite_principale || '',
    activite: SECTIONS[r.section_activite_principale] || '',
    adresse: s.adresse || '',
    code_postal: s.code_postal || '',
    ville: s.libelle_commune || '',
    date_creation: r.date_creation || '',
    effectif: EFFECTIFS[r.tranche_effectif_salarie] || '',
    categorie: r.categorie_entreprise || '',
    ca: fin?.[1]?.ca ?? null,
    resultat: fin?.[1]?.resultat_net ?? null,
    annee_finances: fin?.[0] || null,
    dirigeants: (r.dirigeants || []).slice(0, 5).map((d) => ({
      nom: d.type_dirigeant === 'personne morale'
        ? d.denomination
        : [d.prenoms?.split(' ')[0]?.toLowerCase().replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), d.nom].filter(Boolean).join(' '),
      qualite: d.qualite || '',
    })),
    tva: tvaDepuisSiren(r.siren),
    active: r.etat_administratif !== 'C',
  };
}

export async function rechercher(texte) {
  const q = texte.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, per_page: '8', page: '1' });
  const rep = await fetch(`${API_ETAT}?${params}`);
  if (rep.status === 429) throw new Error('Trop de recherches, réessayez dans quelques secondes');
  if (!rep.ok) throw new Error('Recherche entreprise indisponible');
  const json = await rep.json();
  return Promise.all((json.results || []).map((r) => avecLibelles(depuisEtat(r))));
}

// Recherche automatique après un scan : on ne retient une entreprise que si on est sûr
// (même nom que sur la carte, et même ville quand la carte en indique une).
const compacte = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export async function trouverEntreprise({ societe, ville, email }) {
  const domaine = email?.split('@')[1]?.split('.')[0];
  const nom = societe || domaine;
  if (!nom || compacte(nom).length < 3) return null;
  const resultats = (await rechercher(nom)).filter((r) => r.active !== false);
  let memeNom = resultats.filter((r) => compacte(r.nom) === compacte(nom) || compacte(r.nom).startsWith(compacte(nom)));
  if (memeNom.length > 1 && ville) memeNom = memeNom.filter((r) => compacte(r.ville) === compacte(ville));
  return memeNom.length === 1 ? memeNom[0] : null;
}

// ---------- Pappers ----------
async function appelPappers(chemin, params, token) {
  const url = `${API_PAPPERS}/${chemin}?${new URLSearchParams({ ...params, api_token: token })}`;
  const rep = await fetch(url);
  if (rep.status === 401) throw new Error('Clé Pappers refusée (vérifiez-la dans Réglages)');
  if (rep.status === 402 || rep.status === 403) throw new Error('Plus de crédits Pappers disponibles');
  if (rep.status === 404) throw new Error('Entreprise introuvable sur Pappers');
  if (!rep.ok) throw new Error(`Pappers indisponible (${rep.status})`);
  return rep.json();
}

export async function fichePappers(siren, token) {
  const e = await appelPappers('entreprise', { siren }, token);
  const s = e.siege || {};
  const finances = (e.finances || []).filter((f) => f.chiffre_affaires != null || f.resultat != null)
    .sort((a, b) => (b.annee || 0) - (a.annee || 0));
  const derniere = finances[0];
  return {
    source: 'Pappers',
    siren: e.siren,
    siret: s.siret,
    nom: majuscules(e.nom_entreprise || e.denomination),
    forme_juridique: e.forme_juridique || '',
    naf: e.code_naf || '',
    naf_libelle: e.libelle_code_naf || '',
    secteur: SECTIONS[sectionDepuisNaf(e.code_naf)] || '',
    activite: e.libelle_code_naf || e.domaine_activite || '',
    adresse: [s.adresse_ligne_1, s.adresse_ligne_2].filter(Boolean).join(', '),
    code_postal: s.code_postal || '',
    ville: s.ville || '',
    date_creation: e.date_creation || '',
    effectif: e.effectif || e.tranche_effectif || '',
    categorie: e.categorie_entreprise || '',
    capital: e.capital ?? null,
    ca: derniere?.chiffre_affaires ?? null,
    resultat: derniere?.resultat ?? null,
    annee_finances: derniere?.annee || null,
    dirigeants: (e.representants || []).slice(0, 5).map((d) => ({ nom: d.nom_complet || d.denomination || '', qualite: d.qualite || '' })),
    tva: e.numero_tva_intracommunautaire || tvaDepuisSiren(e.siren),
    objet_social: e.objet_social || '',
    active: !e.entreprise_cessee,
  };
}

export async function creditsPappers(token) {
  const r = await appelPappers('suivi-jetons', {}, token);
  return r.jetons_restants ?? r.credits_restants ?? r.jetons ?? r;
}

// Choix final : Pappers si une clé existe (données plus riches), sinon l'Annuaire
export async function completer(resultat, token) {
  if (!token) return resultat;
  try {
    return await fichePappers(resultat.siren, token);
  } catch (e) {
    e.resultatDeSecours = resultat;
    throw e;
  }
}

const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
export const formaterEuros = (n) => (n == null ? '' : euros.format(n));
