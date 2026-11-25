// Tests du calcul des indicateurs du tableau de bord : cd functions && npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { computeStats, nextActivity, isAdmin, weekKey } = require("../stats-core");

const NOW = new Date("2026-11-25T12:00:00Z");          // mercredi ; semaine du lundi 23/11
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

test("semaine = date du lundi (UTC)", () => {
  assert.strictEqual(weekKey(new Date("2026-11-25T12:00:00Z")), "2026-11-23");
  assert.strictEqual(weekKey(new Date("2026-11-23T00:00:00Z")), "2026-11-23");
  assert.strictEqual(weekKey(new Date("2026-11-22T23:59:59Z")), "2026-11-16");   // dimanche
});

test("utilisateurs actifs, nouveaux et taux de routine", () => {
  const s = computeStats({ now: NOW, users: [
    { createdAt: ago(2), lastSeen: ago(0), hasRoutine: true },
    { createdAt: ago(20), lastSeen: ago(10), hasRoutine: true },
    { createdAt: ago(90), lastSeen: ago(40) },
    { createdAt: "pas une date" }
  ] });
  assert.deepStrictEqual(s.utilisateurs, { total: 4, nouveaux7: 1, nouveaux30: 2, actifs7: 1, actifs30: 2, avecRoutine: 2, tauxRoutine: 50 });
  assert.strictEqual(s.semaines.length, 12);
  assert.strictEqual(s.semaines[11].semaine, "2026-11-23");
  assert.strictEqual(s.semaines[11].inscriptions, 1);
});

test("rétention par cohorte : semaines terminées seulement", () => {
  // Cohorte du 26/10 : 4 inscrits ; 2 reviennent la semaine suivante, 1 quatre semaines après
  const c = "2026-10-26";
  const users = [
    { createdAt: "2026-10-27T10:00:00Z", activeWeeks: [c, "2026-11-02", "2026-11-23"] },
    { createdAt: "2026-10-28T10:00:00Z", activeWeeks: [c, "2026-11-02"] },
    { createdAt: "2026-10-29T10:00:00Z", activeWeeks: [c] },
    { createdAt: "2026-11-01T10:00:00Z", activeWeeks: [c] },
    { createdAt: "2026-11-17T10:00:00Z", activeWeeks: ["2026-11-16"] }
  ];
  const r = computeStats({ now: NOW, users }).retention;
  assert.strictEqual(r.length, 8);
  const ligne = r.find((x) => x.cohorte === c);
  assert.strictEqual(ligne.taille, 4);
  assert.strictEqual(ligne.s1, 50);
  assert.strictEqual(ligne.s2, 0);
  assert.strictEqual(ligne.s4, null);                 // la semaine du 23/11 n'est pas terminée
  const derniere = r[r.length - 1];                   // cohorte du 16/11 : S+1 = semaine en cours
  assert.deepStrictEqual([derniere.cohorte, derniere.taille, derniere.s1], ["2026-11-16", 1, null]);
});

test("tolérance : taux par produit, seuil de significativité, données invalides ignorées", () => {
  const rep = (k, v, extra) => Object.assign({ k, v, s: [], g: "" }, extra);
  const reports = [];
  for (let i = 0; i < 8; i++) reports.push(rep("a", i < 2 ? "reaction" : "ok", i === 0 ? { g: "forte", s: ["rougeurs", "brulure"] } : { s: ["rougeurs"] }));
  for (let i = 0; i < 3; i++) reports.push(rep("b", "reaction"));
  reports.push(rep("c", "super"), null, { v: "ok" });
  const t = computeStats({ now: NOW, reports }).tolerance;
  assert.strictEqual(t.retours, 11);
  assert.strictEqual(t.reactions, 5);
  const a = t.produits[0];
  assert.strictEqual(a.k, "a");                       // significatif d'abord, même si « b » a 100 %
  assert.deepStrictEqual([a.n, a.reaction, a.forte, a.tauxReaction, a.significatif], [8, 2, 1, 25, true]);
  assert.deepStrictEqual(a.symptomes, { rougeurs: 2, brulure: 1 });
  assert.deepStrictEqual([t.produits[1].k, t.produits[1].significatif], ["b", false]);
});

test("activité : une semaine ajoutée une seule fois, 26 au plus, valeurs étrangères écartées", () => {
  const a = nextActivity(["2026-11-23", "<script>", 5], NOW);
  assert.deepStrictEqual(a, { lastSeen: "2026-11-25", activeWeeks: ["2026-11-23"] });
  const many = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10));
  const b = nextActivity(many, NOW);
  assert.strictEqual(b.activeWeeks.length, 26);
  assert.strictEqual(b.activeWeeks[25], "2026-11-23");
});

test("accès administrateur : e-mail vérifié et présent dans la liste", () => {
  assert.strictEqual(isAdmin({ email: "Admin@Example.com", email_verified: true }, "admin@example.com, autre@x.fr"), true);
  assert.strictEqual(isAdmin({ email: "admin@example.com", email_verified: false }, "admin@example.com"), false);
  assert.strictEqual(isAdmin({ email: "pirate@example.com", email_verified: true }, "admin@example.com"), false);
  assert.strictEqual(isAdmin({ email: "admin@example.com", email_verified: true }, ""), false);
  assert.strictEqual(isAdmin(null, "admin@example.com"), false);
});
