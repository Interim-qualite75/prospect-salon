// Service worker : fonctionnement hors ligne + mises à jour automatiques.
// Les fichiers de l'app sont pris sur le réseau en priorité (donc toujours à jour),
// et la copie locale sert quand il n'y a pas de connexion (salon sans Wi-Fi).

const VERSION = 'v1';
const CACHE_APP = `app-${VERSION}`;
const CACHE_LIBS = 'bibliotheques';

const FICHIERS_APP = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'js/donnees.js',
  'js/entreprise.js',
  'js/ocr.js',
  'js/outils.js',
  'js/qr.js',
  'js/relances.js',
  'js/ui.js',
  'js/vcard.js',
  'js/vues/accueil.js',
  'js/vues/fiche.js',
  'js/vues/partager.js',
  'js/vues/prospects.js',
  'js/vues/reglages.js',
  'js/vues/scanner.js',
  'img/logo-interim-qualite.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-badge.png',
  'icones/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(FICHIERS_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k.startsWith('app-') && k !== CACHE_APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bibliothèques à version fixe (jsDelivr) : copie locale d'abord
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(CACHE_LIBS).then(async (c) => {
        const deja = await c.match(req);
        if (deja) return deja;
        const rep = await fetch(req);
        if (rep.ok) c.put(req, rep.clone());
        return rep;
      }),
    );
    return;
  }

  // Fichiers de l'app : réseau d'abord (mises à jour immédiates), copie locale sinon
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          if (rep.ok) caches.open(CACHE_APP).then((c) => c.put(req, rep.clone()));
          return rep;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('index.html')),
    );
  }
  // Tout le reste (Supabase, Pappers, annuaire…) passe directement par le réseau
});

// Clic sur une alerte de relance : ouvre la fiche du prospect
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || '#/accueil', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ('focus' in f) {
          f.navigate(cible).catch(() => {});
          return f.focus();
        }
      }
      return self.clients.openWindow(cible);
    }),
  );
});

// Notifications envoyées par le serveur (relances quand l'app est fermée)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() || {}; } catch { d = { titre: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.titre || 'Relance prospect', {
      body: d.corps || '',
      tag: d.tag,
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-badge.png',
      data: { url: d.url || '#/accueil' },
    }),
  );
});
