// SkinMatch — service worker
// Doit être servi comme un vrai fichier depuis la même origine : un service worker
// enregistré depuis une URL blob: est refusé par les navigateurs.
const VERSION = 'sm-v15';
const CACHE_APP  = VERSION + '-app';
const CACHE_DATA = VERSION + '-data';

// Coquille de l'application, mise en cache à l'installation.
const SHELL = ['./', './index.html', './pharmacie.html', './data/products.js', './manifest.json',
               './manifest-pharmacie.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_APP).then((c) => Promise.all(
      SHELL.map((u) => c.add(u).catch(() => null))   // une ressource absente ne fait pas échouer l'installation
    ))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jamais de cache pour l'authentification et la base de données : ces réponses
  // sont propres à l'utilisateur et doivent rester fraîches.
  if (/googleapis|firebaseio|firebaseapp|generativelanguage/.test(url.hostname)) return;

  // Navigation : réseau d'abord, cache en secours (permet l'usage hors ligne).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          const cle = url.pathname.indexOf('pharmacie') > -1 ? './pharmacie.html' : './index.html';
          caches.open(CACHE_APP).then((c) => c.put(cle, copy));
          return r;
        })
        .catch(() => {
          // Hors ligne : servir la page correspondant à l'adresse demandée,
          // sinon la borne retomberait sur l'application grand public.
          const cible = url.pathname.indexOf('pharmacie') > -1 ? './pharmacie.html' : './index.html';
          return caches.match(cible).then((r) => r || caches.match('./'));
        })
    );
    return;
  }

  // Base produits (data/products.js, data/catalogue.json) : générée depuis le tableur et
  // mise à jour à chaque publication. Réponse immédiate depuis le cache, rafraîchie en
  // arrière-plan (la version suivante sert au prochain lancement) ; réseau si absent.
  if (url.origin === location.origin && /\/data\/(products\.js|catalogue\.json)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE_DATA).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
      if (hit) { net.catch(() => null); return hit; }
      return net;
    })));
    return;
  }

  // Polices, images, styles et décodeur de codes-barres (vendor/, fichiers versionnés) :
  // cache d'abord, réseau en secours.
  if (/\.(png|jpg|jpeg|svg|webp|woff2?|css)$/.test(url.pathname) || /\/vendor\//.test(url.pathname) || /fonts\.(googleapis|gstatic)/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok && (url.origin === location.origin || /fonts\./.test(url.hostname))) {
          const copy = r.clone(); caches.open(CACHE_APP).then((c) => c.put(req, copy));
        }
        return r;
      }).catch(() => hit))
    );
  }
});

// ── Rappels de routine (notifications envoyées par le serveur) ──
// Le serveur n'envoie que le type de rappel et la langue ; le texte est choisi ici.
const RAPPELS = {
  matin: {
    fr: [['🌅 Ta routine du matin', 'Nettoyant, soin, protection solaire : 2 minutes pour ta peau.'],
         ['☀️ N\'oublie pas le SPF', 'La protection solaire, c\'est tous les matins, même quand il fait gris.'],
         ['💧 Routine du matin', 'Une peau bien hydratée dès le matin tient mieux toute la journée.'],
         ['✨ C\'est parti', 'Ta routine du matin t\'attend.']],
    en: [['🌅 Your morning routine', 'Cleanser, care, sunscreen: 2 minutes for your skin.'],
         ['☀️ Don\'t forget your SPF', 'Sunscreen every morning, even on cloudy days.'],
         ['💧 Morning routine', 'Well-hydrated skin in the morning lasts all day.'],
         ['✨ Let\'s go', 'Your morning routine is waiting.']],
    es: [['🌅 Tu rutina de mañana', 'Limpiador, tratamiento, protector solar: 2 minutos para tu piel.'],
         ['☀️ No olvides el SPF', 'Protector solar cada mañana, incluso con nubes.']]
  },
  soir: {
    fr: [['🌙 Ta routine du soir', 'Démaquillage, soin, crème : ta peau se répare pendant la nuit.'],
         ['💆 5 minutes pour toi', 'C\'est l\'heure de ta routine du soir.'],
         ['🌿 Routine du soir', 'Un petit rituel chaque soir, de vrais résultats en quelques semaines.'],
         ['✨ Avant de dormir', 'Ta peau te dira merci demain matin.']],
    en: [['🌙 Your evening routine', 'Cleanse, treat, moisturise: your skin repairs itself overnight.'],
         ['💆 5 minutes for you', 'Time for your evening routine.'],
         ['🌿 Evening routine', 'A small ritual every night, real results in a few weeks.'],
         ['✨ Before bed', 'Your skin will thank you tomorrow morning.']],
    es: [['🌙 Tu rutina de noche', 'Desmaquillar, tratar, hidratar: tu piel se repara de noche.'],
         ['💆 5 minutos para ti', 'Es la hora de tu rutina de noche.']]
  }
};

function texteRappel(type, lang) {
  const parType = RAPPELS[type] || RAPPELS.soir;
  const liste = parType[lang] || parType.fr;
  return liste[Math.floor(Date.now() / 86400000) % liste.length];   // un message différent chaque jour
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const data = (d && d.data) || d || {};
  const type = data.type === 'matin' ? 'matin' : 'soir';
  const [titre, corps] = texteRappel(type, data.lang);
  e.waitUntil(self.registration.showNotification(titre, {
    body: corps, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'sm-' + type, renotify: false,
    data: { url: './?a=routine' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fen) => {
    for (const f of fen) { if ('focus' in f) { if ('navigate' in f) f.navigate(cible).catch(() => {}); return f.focus(); } }
    return self.clients.openWindow(cible);
  }));
});
