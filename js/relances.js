// Relances : ce qui est en retard, pour aujourd'hui, et alertes quand l'heure arrive.

import { debutJour, nomComplet } from './ui.js';

const finJour = () => new Date(debutJour().getTime() + 86400000);

export function classerRelances(prospects) {
  const aujourdhui = debutJour();
  const demain = finJour();
  const dans7 = new Date(aujourdhui.getTime() + 8 * 86400000);
  const actives = prospects
    .filter((p) => p.relance_at && !p.relance_faite)
    .sort((a, b) => a.relance_at.localeCompare(b.relance_at));
  return {
    retard: actives.filter((p) => new Date(p.relance_at) < aujourdhui),
    jour: actives.filter((p) => new Date(p.relance_at) >= aujourdhui && new Date(p.relance_at) < demain),
    semaine: actives.filter((p) => new Date(p.relance_at) >= demain && new Date(p.relance_at) < dans7),
    plusTard: actives.filter((p) => new Date(p.relance_at) >= dans7),
  };
}

// Pastille sur l'icône et dans le menu : en retard + aujourd'hui
export function relancesAFaire(prospects) {
  const { retard, jour } = classerRelances(prospects);
  return [...retard, ...jour];
}

export const etatRelance = (p) => {
  if (!p.relance_at || p.relance_faite) return '';
  const d = new Date(p.relance_at);
  if (d < debutJour()) return 'retard';
  if (d < finJour()) return 'jour';
  return 'futur';
};

// ---------- Notifications ----------
export const notificationsPossibles = () => 'Notification' in window && 'serviceWorker' in navigator;

export async function activerNotifications() {
  if (!notificationsPossibles()) return 'indisponible';
  const reponse = await Notification.requestPermission();
  return reponse;
}

const CLE_DEJA = 'relances-notifiees';
function dejaNotifiees() {
  try { return JSON.parse(localStorage.getItem(CLE_DEJA) || '{}'); } catch { return {}; }
}

// Appelée chaque minute quand l'app est ouverte (ou en arrière-plan sur PC / Android)
export async function verifierRelances(prospects) {
  if (!notificationsPossibles() || Notification.permission !== 'granted') return;
  const deja = dejaNotifiees();
  const maintenant = Date.now();
  const echues = prospects.filter(
    (p) => p.relance_at && !p.relance_faite && new Date(p.relance_at).getTime() <= maintenant && deja[p.id] !== p.relance_at,
  );
  if (!echues.length) return;
  const reg = await navigator.serviceWorker.ready;
  for (const p of echues.slice(0, 5)) {
    await reg.showNotification(`Relance : ${nomComplet(p)}`, {
      body: [p.societe, p.relance_motif].filter(Boolean).join(' · ') || 'Relance prévue maintenant',
      tag: `relance-${p.id}`,
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-badge.png',
      data: { url: `#/prospect/${p.id}` },
    });
    deja[p.id] = p.relance_at;
  }
  try { localStorage.setItem(CLE_DEJA, JSON.stringify(deja)); } catch {}
}
