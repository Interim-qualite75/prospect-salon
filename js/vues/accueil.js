import { listeProspects, profil, enregistrer, etat } from '../donnees.js';
import { $, esc, icone, initiales, nomComplet, dateRelative, dansJours, toast } from '../ui.js';
import { classerRelances, notificationsPossibles, activerNotifications } from '../relances.js';
import { telInternational } from '../vcard.js';
import { ajouterCompteRendu } from './fiche.js';
import { listeTaches } from '../donnees.js';
import { ligneTache, brancherTaches, editerTache } from './taches.js';

let filtre = 'tout';

export function afficher(vue, params, { aller }) {
  const moi = profil();
  const tous = listeProspects();
  const r = classerRelances(tous);
  const heure = new Date().getHours();
  const salut = heure < 18 ? 'Bonjour' : 'Bonsoir';
  const duSalon = moi.salon_en_cours ? tous.filter((p) => p.salon === moi.salon_en_cours) : [];

  const listes = {
    tout: [...r.retard, ...r.jour, ...r.semaine],
    retard: r.retard,
    jour: r.jour,
    semaine: r.semaine,
  };
  const affichees = listes[filtre] || listes.tout;
  const taches = listeTaches();

  vue.innerHTML = `
    <div class="pile">
      <div>
        <h1>${salut} ${esc(moi.prenom || '')}</h1>
        <p class="discret">${new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
      </div>

      ${notificationsPossibles() && Notification.permission === 'default' ? `
        <div class="bandeau">${icone('cloche')}
          <div class="espace">Activez les alertes pour recevoir un rappel à l'heure de chaque relance.</div>
          <button class="btn petit primaire" id="activer-notif">Activer</button>
        </div>` : ''}
      ${!navigator.onLine ? `<div class="bandeau alerte">${icone('alerte')}<div>Pas de réseau : vous pouvez continuer à scanner et à saisir, tout sera envoyé au retour de la connexion.</div></div>` : ''}

      <div class="colonnes">
        <section class="pile">
          <div class="tuiles" role="group" aria-label="Filtrer les relances">
            <button class="tuile retard" data-filtre="retard" aria-pressed="${filtre === 'retard'}"><b>${r.retard.length}</b><span>En retard</span></button>
            <button class="tuile jour" data-filtre="jour" aria-pressed="${filtre === 'jour'}"><b>${r.jour.length}</b><span>Aujourd'hui</span></button>
            <button class="tuile" data-filtre="semaine" aria-pressed="${filtre === 'semaine'}"><b>${r.semaine.length}</b><span>7 prochains jours</span></button>
          </div>

          <div class="ligne"><h2 class="espace">Mes relances</h2>
            ${filtre !== 'tout' ? `<button class="btn petit fantome" data-filtre="tout">Tout voir</button>` : ''}</div>
          <div class="liste" id="liste-relances">
            ${affichees.length ? affichees.map(ligneRelance).join('') : `
              <div class="vide">${icone('ok')}<p>Aucune relance ${filtre === 'retard' ? 'en retard' : filtre === 'jour' ? "aujourd'hui" : 'à venir'}.</p></div>`}
          </div>
        </section>

        <section class="pile">
          <div class="carte pile-s">
            <div class="ligne"><h2 class="espace">${icone('ok')} Mes tâches <span class="tres-discret">(${taches.length})</span></h2>
              <button class="btn petit" id="nouvelle-tache">${icone('plus')} Ajouter</button></div>
            ${taches.length
              ? `<div class="liste" id="liste-taches">${taches.slice(0, 5).map((t) => ligneTache(t)).join('')}</div>`
              : '<p class="discret">Aucune tâche à faire.</p>'}
            <a class="btn petit fantome" href="#/taches">Voir toutes mes tâches</a>
          </div>
          <div class="carte">
            <h2>${icone('agenda')} Salon en cours</h2>
            ${moi.salon_en_cours ? `
              <p><b>${esc(moi.salon_en_cours)}</b></p>
              <p class="discret">${duSalon.length} contact${duSalon.length > 1 ? 's' : ''} · ${duSalon.filter((p) => p.temperature === 'chaud').length} chaud${duSalon.filter((p) => p.temperature === 'chaud').length > 1 ? 's' : ''}</p>`
              : `<p class="discret">Aucun salon en cours. Indiquez-le pour classer automatiquement vos nouveaux contacts.</p>`}
            <div class="ligne" style="margin-top:12px">
              <a class="btn petit" href="#/reglages">${icone('crayon')} ${moi.salon_en_cours ? 'Changer' : 'Indiquer le salon'}</a>
              ${duSalon.length ? `<a class="btn petit" href="#/prospects/salon">${icone('prospects')} Voir les contacts</a>` : ''}
            </div>
          </div>
          <a class="btn primaire geant" href="#/scanner">${icone('scan')} Scanner une carte de visite</a>
          <a class="btn geant" href="#/partager">${icone('qr')} Montrer mon QR code</a>
          <p class="tres-discret">${tous.length} prospect${tous.length > 1 ? 's' : ''} au total</p>
        </section>
      </div>
    </div>`;

  vue.querySelectorAll('[data-filtre]').forEach((b) =>
    b.addEventListener('click', () => {
      filtre = filtre === b.dataset.filtre ? 'tout' : b.dataset.filtre;
      afficher(vue, params, { aller });
    }),
  );

  const rafraichir = () => afficher(vue, params, { aller });
  if ($('#liste-taches', vue)) brancherTaches($('#liste-taches', vue), rafraichir);
  $('#nouvelle-tache', vue).addEventListener('click', async () => {
    if (await editerTache()) rafraichir();
  });

  $('#activer-notif', vue)?.addEventListener('click', async () => {
    const rep = await activerNotifications();
    toast(rep === 'granted' ? 'Alertes activées' : 'Alertes refusées : vous pourrez les activer dans les réglages du téléphone', rep === 'granted' ? 'ok' : 'info');
    afficher(vue, params, { aller });
  });

  vue.querySelectorAll('[data-action]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = etat.prospects.get(b.dataset.id);
      if (!p) return;
      if (b.dataset.action === 'fait') {
        const fait = await ajouterCompteRendu(p, { depuisRelance: true });
        if (fait) afficher(vue, params, { aller });
      } else if (b.dataset.action === 'reporter') {
        enregistrer('prospects', { ...p, relance_at: dansJours(Number(b.dataset.jours)) });
        toast('Relance reportée', 'ok');
        afficher(vue, params, { aller });
      }
    }),
  );
}

function ligneRelance(p) {
  const d = new Date(p.relance_at);
  const classe = d < new Date(new Date().setHours(0, 0, 0, 0)) ? 'retard' : d < new Date(new Date().setHours(24, 0, 0, 0)) ? 'jour' : '';
  const tel = p.tel_mobile || p.tel_fixe;
  return `
    <a class="element ${classe}" href="#/prospect/${p.id}">
      <span class="avatar">${esc(initiales(p))}</span>
      <span class="corps">
        <b>${esc(nomComplet(p))}</b>${p.societe ? ` <span class="discret">· ${esc(p.societe)}</span>` : ''}
        <div class="discret">${esc(p.relance_motif || 'Relance')}</div>
        <div class="tres-discret">${icone('horloge', 'petit')} ${esc(dateRelative(p.relance_at))}</div>
      </span>
      ${tel ? `<span class="btn-icone" role="button" tabindex="0" aria-label="Appeler" onclick="event.stopPropagation();event.preventDefault();location.href='tel:${esc(telInternational(tel))}'">${icone('tel')}</span>` : ''}
      <button class="btn-icone" data-action="reporter" data-jours="1" data-id="${p.id}" aria-label="Reporter à demain" title="Reporter à demain">${icone('horloge')}</button>
      <button class="btn-icone" data-action="fait" data-id="${p.id}" aria-label="Relance faite" title="Relance faite">${icone('ok')}</button>
    </a>`;
}
