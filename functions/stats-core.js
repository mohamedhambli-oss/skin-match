// Calcul des indicateurs du tableau de bord (fonctions pures, testées : cd functions && npm test).
//
// Entrées (lues dans Firestore par index.js) :
//   users   : [{ createdAt, lastSeen, activeWeeks, hasRoutine }]   — aucune donnée de santé
//   reports : [{ k, v, s, g, sem }]                                — retours de tolérance anonymes
// Les semaines sont identifiées par la date de leur lundi (AAAA-MM-JJ, UTC).
"use strict";

const DAY = 86400000;
const MIN_ECHANTILLON = 5;   // en dessous, un taux de réaction par produit n'est pas significatif

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();          // Timestamp Firestore
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function monday(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}
function weekKey(d) { return monday(d).toISOString().slice(0, 10); }
function addDays(key, n) { return new Date(Date.parse(key) + n * DAY).toISOString().slice(0, 10); }
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function computeStats({ users = [], reports = [], now = new Date() } = {}) {
  const today = toDate(now);
  const t = today.getTime();
  const thisWeek = weekKey(today);

  // ── Utilisateurs ──
  const u = users.map((x) => ({
    created: toDate(x.createdAt),
    seen: toDate(x.lastSeen),
    weeks: new Set(Array.isArray(x.activeWeeks) ? x.activeWeeks.filter((w) => typeof w === "string") : []),
    routine: !!x.hasRoutine
  }));
  const seenWithin = (days) => u.filter((x) => x.seen && t - x.seen.getTime() < days * DAY).length;
  const createdWithin = (days) => u.filter((x) => x.created && t - x.created.getTime() < days * DAY).length;
  const utilisateurs = {
    total: u.length,
    nouveaux7: createdWithin(7),
    nouveaux30: createdWithin(30),
    actifs7: seenWithin(7),
    actifs30: seenWithin(30),
    avecRoutine: u.filter((x) => x.routine).length
  };
  utilisateurs.tauxRoutine = pct(utilisateurs.avecRoutine, utilisateurs.total);

  // ── Inscriptions et actifs par semaine (12 dernières semaines) ──
  const semaines = [];
  for (let i = 11; i >= 0; i--) {
    const w = addDays(thisWeek, -7 * i);
    semaines.push({
      semaine: w,
      inscriptions: u.filter((x) => x.created && weekKey(x.created) === w).length,
      actifs: u.filter((x) => x.weeks.has(w)).length
    });
  }

  // ── Rétention par cohorte d'inscription (8 dernières semaines) ──
  // « S+n » : part de la cohorte revenue pendant la n-ième semaine après l'inscription.
  // null tant que cette semaine n'est pas terminée.
  const PAS = [1, 2, 4];
  const retention = [];
  for (let i = 8; i >= 1; i--) {
    const w = addDays(thisWeek, -7 * i);
    const cohorte = u.filter((x) => x.created && weekKey(x.created) === w);
    const ligne = { cohorte: w, taille: cohorte.length };
    PAS.forEach((n) => {
      const cible = addDays(w, 7 * n);
      ligne["s" + n] = cible >= thisWeek || !cohorte.length ? null
        : pct(cohorte.filter((x) => x.weeks.has(cible)).length, cohorte.length);
    });
    retention.push(ligne);
  }

  // ── Tolérance par produit ──
  const parProduit = {};
  let valides = 0;
  reports.forEach((r) => {
    if (!r || typeof r.k !== "string" || !["ok", "neutre", "reaction"].includes(r.v)) return;
    valides++;
    const p = parProduit[r.k] || (parProduit[r.k] = { k: r.k, n: 0, ok: 0, neutre: 0, reaction: 0, forte: 0, symptomes: {} });
    p.n++; p[r.v]++;
    if (r.v === "reaction") {
      if (r.g === "forte") p.forte++;
      (Array.isArray(r.s) ? r.s : []).forEach((s) => { if (typeof s === "string") p.symptomes[s] = (p.symptomes[s] || 0) + 1; });
    }
  });
  const produits = Object.values(parProduit).map((p) => Object.assign(p, {
    tauxReaction: pct(p.reaction, p.n),
    significatif: p.n >= MIN_ECHANTILLON
  })).sort((a, b) => (b.significatif - a.significatif) || (b.tauxReaction - a.tauxReaction) || (b.n - a.n));
  const totalReactions = produits.reduce((s, p) => s + p.reaction, 0);

  return {
    genereLe: today.toISOString(),
    utilisateurs,
    semaines,
    retention,
    tolerance: {
      retours: valides,
      reactions: totalReactions,
      tauxReaction: pct(totalReactions, valides),
      echantillonMin: MIN_ECHANTILLON,
      produits: produits.slice(0, 200)
    }
  };
}

// Côté client : mise à jour quotidienne de l'activité (au plus 26 semaines conservées).
function nextActivity(prev, now) {
  const d = toDate(now);
  const w = weekKey(d);
  const weeks = (Array.isArray(prev) ? prev.filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) : []);
  if (!weeks.includes(w)) weeks.push(w);
  weeks.sort();
  return { lastSeen: d.toISOString().slice(0, 10), activeWeeks: weeks.slice(-26) };
}

function isAdmin(token, adminEmails) {
  if (!token || token.email_verified !== true || typeof token.email !== "string") return false;
  const list = String(adminEmails || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(token.email.toLowerCase());
}

module.exports = { computeStats, nextActivity, isAdmin, weekKey, MIN_ECHANTILLON };
