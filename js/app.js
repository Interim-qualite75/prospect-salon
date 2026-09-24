// Point d'entrée : connexion, navigation entre les écrans, état de synchronisation.

import { supabase, demarrer, arreter, evenements, etat, listeProspects } from './donnees.js';
import { $, $$, esc, icone, toast } from './ui.js';
import { verifierRelances, relancesAFaire } from './relances.js';
import * as accueil from './vues/accueil.js';
import * as scanner from './vues/scanner.js';
import * as prospects from './vues/prospects.js';
import * as fiche from './vues/fiche.js';
import * as partager from './vues/partager.js';
import * as reglages from './vues/reglages.js';
import * as taches from './vues/taches.js';

const ROUTES = {
  accueil: { vue: accueil, titre: 'Accueil', menu: 'accueil' },
  scanner: { vue: scanner, titre: 'Scanner une carte', menu: 'scanner' },
  prospects: { vue: prospects, titre: 'Prospects', menu: 'prospects' },
  prospect: { vue: fiche, titre: 'Fiche prospect', menu: 'prospects', retour: true },
  nouveau: { vue: fiche, titre: 'Nouvelle fiche', menu: 'scanner', retour: true },
  partager: { vue: partager, titre: 'Partager mes infos', menu: 'partager' },
  reglages: { vue: reglages, titre: 'Réglages', menu: 'reglages' },
  taches: { vue: taches, titre: 'Mes tâches', menu: 'accueil', retour: true },
};

let nettoyage = null;
let routeActuelle = null;

function lireRoute() {
  const [nom = 'accueil', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { nom: ROUTES[nom] ? nom : 'accueil', params: params.map(decodeURIComponent) };
}

export function aller(chemin) {
  if (location.hash === `#/${chemin}`) afficherRoute();
  else location.hash = `#/${chemin}`;
}

async function afficherRoute() {
  if (!etat.utilisateur) return;
  const { nom, params } = lireRoute();
  const route = ROUTES[nom];
  if (nettoyage) {
    // Un écran peut refuser de partir (fiche modifiée non enregistrée)
    const ok = await nettoyage({ depart: true });
    if (ok === false) {
      history.replaceState(null, '', `#/${routeActuelle}`);
      return;
    }
  }
  routeActuelle = [nom, ...params].join('/');
  $('#titre-page').textContent = route.titre;
  $('#retour').style.display = route.retour ? 'inline-grid' : '';
  $$('#navigation a').forEach((a) => a.classList.toggle('actif', a.dataset.route === route.menu));
  const conteneur = $('#vue');
  conteneur.innerHTML = '';
  window.scrollTo(0, 0);
  nettoyage = (await route.vue.afficher(conteneur, params, { aller, titre: (t) => ($('#titre-page').textContent = t) })) || null;
}

// ---------- Indicateurs ----------
function majIndicateurs() {
  const el = $('#etat-synchro');
  const lib = el.querySelector('.libelle');
  el.classList.remove('attente', 'hors-ligne');
  if (!navigator.onLine) {
    el.classList.add('hors-ligne');
    lib.textContent = etat.file.length ? `Hors ligne · ${etat.file.length} à envoyer` : 'Hors ligne';
  } else if (etat.file.length || etat.synchroEnCours) {
    el.classList.add('attente');
    lib.textContent = 'Synchronisation…';
  } else {
    lib.textContent = 'À jour';
  }
  const n = relancesAFaire(listeProspects()).length;
  const c = $('#compteur-relances');
  c.hidden = !n;
  c.textContent = n;
  if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- Connexion ----------
function ecranConnexion() {
  document.body.classList.remove('connecte');
  $('#entete').hidden = true;
  $('#navigation').hidden = true;
  const vue = $('#vue');
  vue.className = '';
  vue.innerHTML = `
    <div class="connexion">
      <form class="carte pile" id="form-connexion">
        <div>
          <img class="logo" src="img/logo-interim-qualite.png" alt="Intérim Qualité">
          <p class="slogan">Prospect Salon · Des hommes et des femmes de qualité</p>
        </div>
        <label class="champ"><span>Adresse email</span>
          <input type="email" name="email" autocomplete="username" required placeholder="prenom.nom@groupeip.fr"></label>
        <label class="champ"><span>Mot de passe</span>
          <input type="password" name="mdp" autocomplete="current-password" required></label>
        <button class="btn primaire large" type="submit">Se connecter</button>
        <button class="btn fantome petit" type="button" id="mdp-oublie">Mot de passe oublié</button>
        <p class="tres-discret" id="msg-connexion" role="alert"></p>
      </form>
    </div>`;
  const form = $('#form-connexion');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = form.querySelector('[type=submit]');
    bouton.disabled = true;
    $('#msg-connexion').textContent = '';
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.mdp.value,
    });
    bouton.disabled = false;
    if (error) {
      $('#msg-connexion').textContent = /invalid/i.test(error.message)
        ? 'Email ou mot de passe incorrect.'
        : `Connexion impossible : ${error.message}`;
    }
  });
  $('#mdp-oublie').addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) return ($('#msg-connexion').textContent = "Saisissez d'abord votre adresse email.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#msg-connexion').textContent = error
      ? `Envoi impossible : ${error.message}`
      : 'Un email vous a été envoyé pour choisir un nouveau mot de passe.';
  });
}

async function nouveauMotDePasse() {
  const { modale } = await import('./ui.js');
  const { valeur, dlg } = await modale({
    titre: 'Nouveau mot de passe',
    contenu: `<label class="champ"><span>Choisissez votre nouveau mot de passe</span>
      <input type="password" name="mdp" minlength="8" autocomplete="new-password" required></label>`,
    actions: [{ libelle: 'Enregistrer', valeur: 'ok', classe: 'primaire' }],
  });
  const mdp = dlg.querySelector('[name=mdp]').value;
  if (valeur !== 'ok' || mdp.length < 8) return;
  const { error } = await supabase.auth.updateUser({ password: mdp });
  toast(error ? `Erreur : ${error.message}` : 'Mot de passe modifié', error ? 'erreur' : 'ok');
}

async function entrerDansApp(utilisateur) {
  if (etat.utilisateur?.id === utilisateur.id) return;
  document.body.classList.add('connecte');
  $('#entete').hidden = false;
  $('#navigation').hidden = false;
  $('#vue').className = 'vue';
  await demarrer(utilisateur);
  afficherRoute();
}

supabase.auth.onAuthStateChange((evenement, session) => {
  if (evenement === 'PASSWORD_RECOVERY') setTimeout(nouveauMotDePasse, 300);
  if (session?.user) setTimeout(() => entrerDansApp(session.user), 0);
  else if (evenement === 'SIGNED_OUT' || evenement === 'INITIAL_SESSION') {
    arreter();
    nettoyage = null;
    ecranConnexion();
  }
});

// ---------- Démarrage ----------
addEventListener('hashchange', afficherRoute);
$('#retour').addEventListener('click', () => (history.length > 1 ? history.back() : aller('accueil')));
evenements.addEventListener('change', (e) => {
  majIndicateurs();
  // Les listes se mettent à jour d'elles-mêmes quand des données arrivent
  const { nom } = lireRoute();
  if (e.detail === 'tout' && ['accueil', 'prospects', 'partager', 'taches'].includes(nom) && !document.querySelector('dialog[open]')) afficherRoute();
});
addEventListener('online', majIndicateurs);
addEventListener('offline', majIndicateurs);
setInterval(() => {
  if (!etat.utilisateur) return;
  majIndicateurs();
  verifierRelances(listeProspects());
}, 60000);

// Bouton « Installer l'app » (Android, Edge et Chrome sur ordinateur)
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.invitationInstallation = e;
});

// Mises à jour automatiques : le service worker vérifie la présence d'une nouvelle version
// à chaque retour sur l'app, et la page se recharge dès qu'elle est installée.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch((e) => console.warn('Service worker', e));
  let dejaRecharge = false;
  const avaitUnControleur = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUnControleur || dejaRecharge || document.querySelector('dialog[open]')) return;
    dejaRecharge = true;
    location.reload();
  });
}
