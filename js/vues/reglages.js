// Réglages : mes coordonnées, salon, Pappers, IA, email de suivi, alertes, installation, données, compte.

import { supabase, etat, profil, enregistrerProfil, listeProspects, echangesDe, synchroniser, reessayerEchecs } from '../donnees.js';
import { $, esc, icone, toast, telecharger, dateRelative, estIOS, estAppInstallee } from '../ui.js';
import { creditsPappers } from '../entreprise.js';
import { exportExcel, exportVCards, MODELE_EMAIL_DEFAUT, MESSAGERIES, ouvrirEmail } from '../outils.js';
import { notificationsPossibles, activerNotifications } from '../relances.js';

const champ = (nom, libelle, valeur, { type = 'text', auto = 'off', ph = '', mode = '' } = {}) => `
  <label class="champ"><span>${libelle}</span>
    <input name="${nom}" type="${type}" value="${esc(valeur ?? '')}" autocomplete="${auto}" placeholder="${esc(ph)}" ${mode ? `inputmode="${mode}"` : ''}></label>`;

// Une clé masquée (points) laisse croire qu'elle n'est pas enregistrée : on l'annonce clairement
const etatCle = (valeur) => valeur
  ? `<p class="discret">${icone('ok')} Clé enregistrée (se termine par « ${esc(valeur.slice(-4))} »)</p>`
  : '<p class="tres-discret">Aucune clé enregistrée.</p>';

// Pappers renvoie plusieurs compteurs (abonnement, à l'unité…) : on additionne ce qui reste
function lireCredits(c) {
  if (typeof c !== 'object' || !c) return c;
  const restants = Object.entries(c).filter(([k, v]) => /restant/i.test(k) && typeof v === 'number');
  return restants.length ? restants.reduce((s, [, v]) => s + v, 0) : null;
}

// Sauvegarde complète : fiches actives et archivées (pas la corbeille)
const horsCorbeille = () => listeProspects({ vue: 'tous' }).filter((p) => !p.supprime_at);

export function afficher(vue) {
  const moi = profil();
  const notif = notificationsPossibles() ? Notification.permission : 'indisponible';

  vue.innerHTML = `
    <div class="colonnes">
      <div class="pile">
        <form class="carte pile-s" id="f-coordonnees">
          <h2>${icone('contact')} Mes coordonnées <span class="tres-discret">(QR code et emails)</span></h2>
          <div class="grille-2">
            ${champ('prenom', 'Prénom', moi.prenom)}
            ${champ('nom', 'Nom', moi.nom)}
            ${champ('fonction', 'Fonction', moi.fonction)}
            ${champ('societe', 'Société', moi.societe)}
            ${champ('tel_mobile', 'Mobile', moi.tel_mobile, { type: 'tel' })}
            ${champ('tel_fixe', 'Téléphone fixe', moi.tel_fixe, { type: 'tel' })}
            ${champ('email', 'Email', moi.email, { type: 'email' })}
            ${champ('site', 'Site web', moi.site)}
            ${champ('adresse', 'Adresse', moi.adresse)}
            <div class="grille-2">${champ('code_postal', 'Code postal', moi.code_postal, { mode: 'numeric' })}${champ('ville', 'Ville', moi.ville)}</div>
          </div>
          <button class="btn primaire" type="submit">${icone('ok')} Enregistrer mes coordonnées</button>
        </form>

        <form class="carte pile-s" id="f-salon">
          <h2>${icone('agenda')} Salon et listes</h2>
          ${champ('salon_en_cours', 'Salon en cours (ajouté automatiquement aux nouvelles fiches)', moi.salon_en_cours, { ph: "Salon de l'emploi Paris 2026" })}
          ${champ('besoins_liste', 'Besoins proposés sur les fiches (séparés par des virgules)', (moi.besoins_liste || []).join(', '))}
          <button class="btn" type="submit">${icone('ok')} Enregistrer</button>
        </form>

        <form class="carte pile-s" id="f-messagerie">
          <h2>${icone('mail')} Ma messagerie</h2>
          <p class="discret">Les emails (suivi, propositions, synthèses) s'ouvrent déjà remplis dans cette messagerie.</p>
          <label class="champ"><span>Ouvrir mes emails avec</span>
            <select name="messagerie">${Object.entries(MESSAGERIES).map(([k, v]) =>
              `<option value="${k}" ${(moi.messagerie || 'outlook') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <p class="tres-discret">Outlook (application) : sur le téléphone, l'app Outlook s'ouvre directement. Sur le PC, Outlook doit être la messagerie par défaut de Windows (Paramètres → Applications → Applications par défaut → « MAILTO » → Outlook).</p>
          <div class="ligne"><button class="btn" type="submit">${icone('ok')} Enregistrer</button>
            <button class="btn fantome" type="button" id="tester-messagerie">Essayer</button></div>
        </form>

        <form class="carte pile-s" id="f-email">
          <h2>${icone('mail')} Email de suivi</h2>
          <p class="tres-discret">Mots remplacés automatiquement : {prenom} {nom} {societe} {salon} {documents} {signature}</p>
          <label class="champ"><span>Modèle</span><textarea name="modele_email" style="min-height:220px">${esc(moi.modele_email || MODELE_EMAIL_DEFAUT)}</textarea></label>
          <div class="ligne"><button class="btn" type="submit">${icone('ok')} Enregistrer</button>
            <button class="btn fantome" type="button" id="modele-defaut">Revenir au modèle d'origine</button></div>
        </form>
      </div>

      <div class="pile">
        <form class="carte pile-s" id="f-pappers">
          <h2>${icone('entreprise')} Recherche entreprise (Pappers)</h2>
          <p class="discret">Sans clé : Annuaire des entreprises gratuit. Avec une clé Pappers : chiffre d'affaires, dirigeants et fiche complète (1 crédit par prospect).</p>
          ${champ('pappers_token', 'Clé API Pappers', moi.pappers_token, { type: 'password', auto: 'off' })}
          ${etatCle(moi.pappers_token)}
          <div class="ligne">
            <button class="btn" type="submit">${icone('ok')} Enregistrer</button>
            <button class="btn fantome" type="button" id="tester-pappers">Tester et voir mes crédits</button>
          </div>
          <p class="discret" id="credits" role="status"></p>
          <p class="tres-discret">Obtenir une clé : <a href="https://www.pappers.fr/api" target="_blank" rel="noopener">pappers.fr/api</a> → créer un compte avec votre email pro (100 crédits offerts).</p>
        </form>

        <form class="carte pile-s" id="f-ia">
          <h2>${icone('ia')} Option IA (facultative)</h2>
          <p class="discret">Lecture des cartes plus fiable et mise en forme des comptes rendus dictés. Quelques centimes par utilisation, facturés par Anthropic.</p>
          ${champ('ia_cle', 'Clé API Claude', moi.ia_cle, { type: 'password', auto: 'off' })}
          ${etatCle(moi.ia_cle)}
          <button class="btn" type="submit">${icone('ok')} Enregistrer</button>
        </form>

        <div class="carte pile-s">
          <h2>${icone('cloche')} Alertes de relance</h2>
          <p class="discret">${notif === 'granted' ? 'Alertes activées sur cet appareil.' : notif === 'denied' ? 'Alertes bloquées : autorisez les notifications pour cette app dans les réglages de l’appareil.' : notif === 'indisponible' ? (estIOS() && !estAppInstallee() ? 'Sur iPhone, installez d’abord l’app sur l’écran d’accueil (voir ci-dessous).' : 'Alertes non disponibles sur ce navigateur.') : 'Recevez une alerte à l’heure de chaque relance.'}</p>
          ${notif === 'default' ? `<button class="btn primaire" id="activer-notif">${icone('cloche')} Activer les alertes</button>` : ''}
          <p class="tres-discret">Pour une alerte garantie même téléphone éteint ou app fermée, utilisez « Ajouter à mon agenda » sur la fiche.</p>
        </div>

        <div class="carte pile-s">
          <h2>${icone('mobile')} Installer l'app (icône Intérim Qualité)</h2>
          ${estAppInstallee() ? '<p class="discret">L’app est installée sur cet appareil.</p>' : `
            ${window.invitationInstallation ? `<button class="btn primaire" id="installer">${icone('telecharger')} Installer sur cet appareil</button>` : ''}
            <p class="discret"><b>iPhone</b> : ouvrez l’adresse dans <b>Safari</b> → bouton <b>•••</b> en bas à droite (ou Partager ${icone('envoyer')}) → <b>Partager</b> → faites défiler → « Sur l’écran d’accueil » → <b>Ajouter</b>. Connectez-vous une fois dans l’app installée : elle s’en souviendra.</p>
            <p class="discret"><b>Android</b> (Chrome) : menu ⋮ → « Installer l’application ».</p>
            <p class="discret"><b>Ordinateur</b> (Edge ou Chrome) : icône d’installation dans la barre d’adresse, ou menu → « Installer Prospect IQ ».</p>`}
        </div>

        <div class="carte pile-s">
          <h2>${icone('synchro')} Mes données</h2>
          <p class="discret">${listeProspects().length} prospects · ${etat.derniereSynchro ? `synchronisé ${esc(dateRelative(etat.derniereSynchro))}` : 'pas encore synchronisé'}
            ${etat.file.length ? ` · ${etat.file.length} modification(s) en attente d’envoi` : ''}</p>
          ${etat.echecs.length ? `<div class="bandeau alerte">${icone('alerte')}<div class="espace">${etat.echecs.length} modification(s) refusée(s) par le serveur.</div>
            <button class="btn petit" id="reessayer">Réessayer</button></div>` : ''}
          <div class="ligne">
            <button class="btn" id="synchro">${icone('synchro')} Synchroniser</button>
            <button class="btn" id="excel">${icone('telecharger')} Export Excel</button>
            <button class="btn" id="vcf">${icone('contact')} Export contacts</button>
          </div>
        </div>

        <div class="carte pile-s">
          <h2>${icone('sortir')} Mon compte</h2>
          <p class="discret">Compte : ${esc(etat.utilisateur?.email || '')}</p>
          <div class="ligne">
            <button class="btn" id="changer-mdp">Changer mon mot de passe</button>
            <button class="btn danger" id="deconnexion">${icone('sortir')} Se déconnecter</button>
          </div>
        </div>
      </div>
    </div>`;

  const lire = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  const sauver = (id, transformer = (x) => x, message = 'Enregistré') =>
    $(id, vue).addEventListener('submit', (e) => {
      e.preventDefault();
      enregistrerProfil(transformer(lire(e.target)));
      toast(message, 'ok');
    });

  sauver('#f-coordonnees', (x) => x, 'Coordonnées enregistrées : votre QR code est à jour');
  sauver('#f-salon', (x) => ({ ...x, besoins_liste: x.besoins_liste.split(',').map((b) => b.trim()).filter(Boolean) }));
  sauver('#f-email');
  sauver('#f-messagerie', (x) => x, 'Messagerie enregistrée');
  $('#tester-messagerie', vue).addEventListener('click', () =>
    ouvrirEmail({ a: moi.email || '', sujet: 'Essai Prospect IQ', corps: 'Si vous lisez ce message dans votre messagerie, le réglage fonctionne.' },
      $('#f-messagerie [name=messagerie]', vue).value));
  const tester = async () => {
    const token = $('#f-pappers [name=pappers_token]', vue).value.trim();
    if (!token) return toast('Collez d’abord votre clé Pappers');
    $('#credits', vue).textContent = 'Vérification…';
    try {
      const n = lireCredits(await creditsPappers(token));
      $('#credits', vue).textContent = n == null ? '✔ Clé valide.' : `✔ Clé valide : ${n} crédits restants.`;
    } catch (e) {
      $('#credits', vue).textContent = `✖ ${e.message}`;
    }
  };

  // Après l'enregistrement d'une clé, on réaffiche la page pour montrer « Clé enregistrée »
  for (const [id, message] of [['#f-pappers', 'Clé Pappers enregistrée'], ['#f-ia', 'Clé IA enregistrée']]) {
    $(id, vue).addEventListener('submit', (e) => {
      e.preventDefault();
      enregistrerProfil(lire(e.target));
      toast(message, 'ok');
      afficher(vue);
      if (id === '#f-pappers' && profil().pappers_token) $('#tester-pappers', vue).click();
    });
  }

  $('#modele-defaut', vue).addEventListener('click', () => {
    $('#f-email textarea', vue).value = MODELE_EMAIL_DEFAUT;
  });
  $('#tester-pappers', vue).addEventListener('click', tester);
  $('#activer-notif', vue)?.addEventListener('click', async () => {
    await activerNotifications();
    afficher(vue);
  });
  $('#installer', vue)?.addEventListener('click', async () => {
    window.invitationInstallation.prompt();
    await window.invitationInstallation.userChoice;
    window.invitationInstallation = null;
    afficher(vue);
  });
  $('#reessayer', vue)?.addEventListener('click', async () => {
    await reessayerEchecs();
    afficher(vue);
  });
  $('#synchro', vue).addEventListener('click', async () => {
    await synchroniser();
    toast(navigator.onLine ? 'Synchronisé' : 'Pas de réseau', navigator.onLine ? 'ok' : 'erreur');
    afficher(vue);
  });
  $('#excel', vue).addEventListener('click', () =>
    telecharger(exportExcel(horsCorbeille(), echangesDe), `prospects-${new Date().toISOString().slice(0, 10)}.csv`));
  $('#vcf', vue).addEventListener('click', () => telecharger(exportVCards(horsCorbeille()), 'contacts-prospects.vcf'));
  $('#changer-mdp', vue).addEventListener('click', async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(etat.utilisateur.email, { redirectTo: location.origin + location.pathname });
    toast(error ? `Erreur : ${error.message}` : 'Un email vous a été envoyé pour changer le mot de passe', error ? 'erreur' : 'ok');
  });
  $('#deconnexion', vue).addEventListener('click', () => supabase.auth.signOut());
}
