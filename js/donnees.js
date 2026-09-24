// Données de l'app : Supabase en ligne + copie locale pour travailler sans réseau.
// Toute modification est d'abord appliquée localement, puis mise dans une file
// d'envoi qui part vers Supabase dès que la connexion est là (salons sans Wi-Fi).

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';
import { SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, PROFIL_PAR_DEFAUT } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const evenements = new EventTarget();
const signaler = (quoi) => evenements.dispatchEvent(new CustomEvent('change', { detail: quoi }));

// ---------- Petit stockage local (IndexedDB) ----------
let dbPromesse;
function idb() {
  dbPromesse ??= new Promise((ok, ko) => {
    const r = indexedDB.open('prospect-salon', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbPromesse;
}
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((ok, ko) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => ko(tx.error);
  });
}
const lireLocal = (cle) => kv('readonly', (s) => s.get(cle));
const ecrireLocal = (cle, val) => kv('readwrite', (s) => s.put(val, cle));
const effacerLocal = (cle) => kv('readwrite', (s) => s.delete(cle));

// ---------- État en mémoire ----------
export const etat = {
  utilisateur: null,
  profil: null,
  prospects: new Map(),
  echanges: new Map(),
  documents: new Map(),
  taches: new Map(),
  propositions: new Map(),
  file: [],          // modifications en attente d'envoi
  echecs: [],        // modifications refusées par le serveur
  derniereSynchro: null,
  enLigne: navigator.onLine,
  synchroEnCours: false,
};

const TABLES = ['prospects', 'echanges', 'documents', 'taches', 'propositions'];
// Tables ajoutées après coup : tant qu'elles n'existent pas sur le serveur, on garde la copie locale
const TABLES_RECENTES = ['taches', 'propositions'];
const cle = (nom) => `${etat.utilisateur.id}:${nom}`;

async function sauverCache() {
  await ecrireLocal(cle('cache'), {
    profil: etat.profil,
    prospects: [...etat.prospects.values()],
    echanges: [...etat.echanges.values()],
    documents: [...etat.documents.values()],
    taches: [...etat.taches.values()],
    propositions: [...etat.propositions.values()],
    derniereSynchro: etat.derniereSynchro,
  });
}
const sauverFile = () => ecrireLocal(cle('file'), { file: etat.file, echecs: etat.echecs });

// ---------- Démarrage ----------
export async function demarrer(utilisateur) {
  etat.utilisateur = utilisateur;
  const cache = await lireLocal(cle('cache'));
  if (cache) {
    etat.profil = cache.profil;
    for (const t of TABLES) etat[t] = new Map((cache[t] || []).map((r) => [r.id, r]));
    etat.derniereSynchro = cache.derniereSynchro;
  }
  const f = await lireLocal(cle('file'));
  etat.file = f?.file || [];
  etat.echecs = f?.echecs || [];
  signaler('tout');
  synchroniser();
}

export function arreter() {
  etat.utilisateur = null;
  etat.profil = null;
  for (const t of TABLES) etat[t] = new Map();
  etat.file = [];
  etat.echecs = [];
}

// ---------- Lecture ----------
export const listeProspects = () =>
  [...etat.prospects.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

export const echangesDe = (prospectId) =>
  [...etat.echanges.values()]
    .filter((e) => e.prospect_id === prospectId)
    .sort((a, b) => (b.date_echange || '').localeCompare(a.date_echange || ''));

// Tâches à faire : en retard et urgentes d'abord, puis par échéance
const RANG_PRIORITE = { urgente: 0, normale: 1, faible: 2 };
export const listeTaches = ({ prospectId, faites = false } = {}) =>
  [...etat.taches.values()]
    .filter((t) => !!t.faite === faites && (!prospectId || t.prospect_id === prospectId))
    .sort((a, b) =>
      faites
        ? (b.faite_at || '').localeCompare(a.faite_at || '')
        : (RANG_PRIORITE[a.priorite] ?? 1) - (RANG_PRIORITE[b.priorite] ?? 1) ||
          (a.echeance || '9').localeCompare(b.echeance || '9'));

export const listePropositions = (prospectId) =>
  [...etat.propositions.values()]
    .filter((x) => !prospectId || x.prospect_id === prospectId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

export const listeDocuments = () =>
  [...etat.documents.values()].sort((a, b) => a.ordre - b.ordre || (a.created_at || '').localeCompare(b.created_at || ''));

export const profil = () => ({ ...PROFIL_PAR_DEFAUT, ...(etat.profil || {}) });

// ---------- Écriture (locale d'abord, puis envoi) ----------
export function nouvelId() {
  return crypto.randomUUID();
}

export function enregistrer(table, ligne) {
  const maintenant = new Date().toISOString();
  const l = { ...ligne, user_id: etat.utilisateur.id, updated_at: maintenant };
  l.id ??= nouvelId();
  l.created_at ??= maintenant;
  etat[table].set(l.id, l);
  ajouterALaFile({ type: 'upsert', table, id: l.id, ligne: l });
  return l;
}

export function supprimer(table, id) {
  etat[table].delete(id);
  if (table === 'prospects') {
    for (const e of [...etat.echanges.values()]) if (e.prospect_id === id) etat.echanges.delete(e.id);
    for (const t of [...etat.taches.values()]) if (t.prospect_id === id) etat.taches.delete(t.id);
    for (const x of [...etat.propositions.values()]) if (x.prospect_id === id) etat.propositions.delete(x.id);
  }
  // Inutile d'envoyer une création qui n'est jamais partie
  etat.file = etat.file.filter((op) => !(op.table === table && op.id === id && op.type === 'upsert'));
  ajouterALaFile({ type: 'delete', table, id });
}

export function enregistrerProfil(modifs) {
  etat.profil = { ...profil(), ...modifs, user_id: etat.utilisateur.id, updated_at: new Date().toISOString() };
  ajouterALaFile({ type: 'profil', ligne: etat.profil });
}

// Photo d'une carte : gardée localement tant qu'elle n'est pas envoyée
export async function enregistrerPhotoCarte(prospectId, blob) {
  const chemin = `${etat.utilisateur.id}/${prospectId}.jpg`;
  await ecrireLocal(`photo:${chemin}`, blob);
  ajouterALaFile({ type: 'photo', chemin });
  return chemin;
}

const urlsPhotos = new Map();
export async function urlPhotoCarte(chemin) {
  if (!chemin) return null;
  if (urlsPhotos.has(chemin)) return urlsPhotos.get(chemin);
  const locale = await lireLocal(`photo:${chemin}`);
  let url = null;
  if (locale) url = URL.createObjectURL(locale);
  else {
    const { data } = await supabase.storage.from('cartes').createSignedUrl(chemin, 3600);
    url = data?.signedUrl || null;
  }
  if (url) urlsPhotos.set(chemin, url);
  return url;
}

function ajouterALaFile(op) {
  // Plusieurs modifications de la même fiche = une seule à envoyer
  if (op.type === 'upsert') {
    const i = etat.file.findIndex((o) => o.type === 'upsert' && o.table === op.table && o.id === op.id);
    if (i >= 0) etat.file[i] = op;
    else etat.file.push(op);
  } else if (op.type === 'profil') {
    etat.file = etat.file.filter((o) => o.type !== 'profil');
    etat.file.push(op);
  } else {
    etat.file.push(op);
  }
  sauverFile();
  sauverCache();
  signaler(op.table || op.type);
  envoyer();
}

// ---------- Envoi vers Supabase ----------
const erreurReseau = (e) =>
  !navigator.onLine || e?.name === 'TypeError' || /fetch|network|Failed to|Load failed/i.test(e?.message || '');

const tableAbsente = (e) => /PGRST205|42P01/.test(e?.code || '') || /could not find the table|does not exist/i.test(e?.message || '');

let envoiEnCours = null;
export function envoyer() {
  envoiEnCours ??= (async () => {
    const enAttente = [];   // tâches gardées tant que la table n'existe pas sur le serveur
    try {
      while (etat.file.length && navigator.onLine) {
        const op = etat.file[0];
        try {
          await executer(op);
          etat.file.shift();
        } catch (e) {
          if (erreurReseau(e)) break;
          if (TABLES_RECENTES.includes(op.table) && tableAbsente(e)) enAttente.push(op);
          else {
            console.error('Envoi refusé', op, e);
            etat.echecs.push({ op, erreur: e.message || String(e), le: new Date().toISOString() });
          }
          etat.file.shift();
        }
        await sauverFile();
      }
    } finally {
      if (enAttente.length) {
        etat.file.push(...enAttente);
        await sauverFile();
      }
      envoiEnCours = null;
      signaler('file');
    }
  })();
  return envoiEnCours;
}

async function executer(op) {
  if (op.type === 'upsert') {
    const { error } = await supabase.from(op.table).upsert(op.ligne, { onConflict: 'id' });
    if (error) throw error;
  } else if (op.type === 'delete') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.id);
    if (error) throw error;
  } else if (op.type === 'profil') {
    const { error } = await supabase.from('profil').upsert(op.ligne, { onConflict: 'user_id' });
    if (error) throw error;
  } else if (op.type === 'photo') {
    const blob = await lireLocal(`photo:${op.chemin}`);
    if (!blob) return;
    const { error } = await supabase.storage
      .from('cartes')
      .upload(op.chemin, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    await effacerLocal(`photo:${op.chemin}`);
  }
}

export async function reessayerEchecs() {
  etat.file.push(...etat.echecs.map((e) => e.op));
  etat.echecs = [];
  await sauverFile();
  return envoyer();
}

// ---------- Récupération depuis Supabase ----------
export async function synchroniser() {
  if (!etat.utilisateur || !navigator.onLine || etat.synchroEnCours) return;
  etat.synchroEnCours = true;
  signaler('synchro');
  try {
    await envoyer();
    const [pr, ec, dc, pf, ...recentes] = await Promise.all([
      supabase.from('prospects').select('*'),
      supabase.from('echanges').select('*'),
      supabase.from('documents').select('*'),
      supabase.from('profil').select('*').maybeSingle(),
      ...TABLES_RECENTES.map((t) => supabase.from(t).select('*')),
    ]);
    for (const r of [pr, ec, dc, pf]) if (r.error) throw r.error;
    etat.prospects = new Map(pr.data.map((r) => [r.id, r]));
    etat.echanges = new Map(ec.data.map((r) => [r.id, r]));
    etat.documents = new Map(dc.data.map((r) => [r.id, r]));
    TABLES_RECENTES.forEach((t, i) => {
      const r = recentes[i];
      if (t === 'taches') etat.tachesServeur = !r.error;
      if (!r.error) etat[t] = new Map(r.data.map((x) => [x.id, x]));
      else console.warn(`${t} non synchronisées`, r.error.message);
    });
    if (pf.data) etat.profil = pf.data;
    else if (!etat.profil) enregistrerProfil({});   // premier lancement : crée le profil par défaut
    // Réapplique ce qui n'est pas encore parti
    for (const op of etat.file) {
      if (op.type === 'upsert') etat[op.table].set(op.id, op.ligne);
      if (op.type === 'delete') etat[op.table].delete(op.id);
      if (op.type === 'profil') etat.profil = op.ligne;
    }
    etat.derniereSynchro = new Date().toISOString();
    await sauverCache();
  } catch (e) {
    if (!erreurReseau(e)) console.error('Synchronisation', e);
  } finally {
    etat.synchroEnCours = false;
    signaler('tout');
  }
}

addEventListener('online', () => {
  etat.enLigne = true;
  synchroniser();
});
addEventListener('offline', () => {
  etat.enLigne = false;
  signaler('file');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') synchroniser();
});
setInterval(() => document.visibilityState === 'visible' && synchroniser(), 120000);

// ---------- Documents à partager (PDF) : nécessite le réseau ----------
export async function ajouterDocument(fichier, titre) {
  const id = nouvelId();
  const propre = fichier.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
  const chemin = `${etat.utilisateur.id}/${id}-${propre}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(chemin, fichier, { contentType: fichier.type || 'application/pdf', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('documents').getPublicUrl(chemin);
  return enregistrer('documents', {
    id,
    titre,
    chemin,
    url_publique: data.publicUrl,
    taille: fichier.size,
    ordre: etat.documents.size,
  });
}

export async function supprimerDocument(doc) {
  await supabase.storage.from('documents').remove([doc.chemin]);
  supprimer('documents', doc.id);
}
