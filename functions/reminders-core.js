// Rappels de routine envoyés par le serveur (Firebase Cloud Messaging) — logique pure, testée :
//   cd functions && npm test
//
// Chaque personne qui active les rappels enregistre dans push/{uid} :
//   token  : jeton FCM de l'appareil
//   lang   : "fr" | "en" | "es"
//   matin  : créneau UTC « HHMM » (quart d'heure) ou null
//   soir   : idem
// L'app recalcule les créneaux UTC à chaque ouverture (changement d'heure, voyage).
// Toutes les 15 minutes, la fonction « reminders » envoie les rappels du créneau en cours.
// Le message ne contient que le type de rappel et la langue : le texte est choisi par
// le service worker sur le téléphone. Aucune donnée de santé ne transite.
"use strict";

const KINDS = ["matin", "soir"];
const LANGS = ["fr", "en", "es"];

// Créneau UTC (quart d'heure inférieur) d'une date : « HHMM ».
function slotOf(date) {
  const d = new Date(date);
  const q = Math.floor(d.getUTCMinutes() / 15) * 15;
  return String(d.getUTCHours()).padStart(2, "0") + String(q).padStart(2, "0");
}

function isSlot(v) {
  return typeof v === "string" && /^([01]\d|2[0-3])(00|15|30|45)$/.test(v);
}

// Message FCM « données seules » : le service worker de l'app l'affiche lui-même.
function buildMessage(doc, kind) {
  if (!doc || typeof doc.token !== "string" || !doc.token || !KINDS.includes(kind)) return null;
  const lang = LANGS.includes(doc.lang) ? doc.lang : "fr";
  return {
    token: doc.token,
    data: { type: kind, lang },
    webpush: {
      headers: { TTL: "3600", Urgency: "normal", Topic: "sm-" + kind },   // périmé après 1 h, remplace le précédent
    },
  };
}

// Erreurs qui signifient que le jeton n'est plus valable (application désinstallée,
// notifications coupées) : la fiche push/{uid} est alors supprimée.
// (« invalid-argument » n'en fait pas partie : il peut venir d'un message mal formé, et
// supprimerait alors les abonnements de tout le monde.)
const DEAD = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];
function isDeadToken(code) { return DEAD.includes(code); }

module.exports = { slotOf, isSlot, buildMessage, isDeadToken, KINDS, LANGS };
