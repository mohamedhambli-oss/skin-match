// Test du point d'accès « stats » sur les émulateurs Firestore + Auth :
//   cd firestore-tests && npm test
"use strict";
const assert = require("node:assert");
process.env.GCLOUD_PROJECT = "demo-skinmatch";
process.env.ADMIN_EMAILS = "admin@example.com";
const fns = require("../index.js");
const admin = require("firebase-admin");

async function idToken(email, verified) {
  await admin.auth().createUser({ email, password: "secret123", emailVerified: verified }).catch(() => {});
  const r = await fetch("http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST +
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "secret123", returnSecureToken: true }) });
  return (await r.json()).idToken;
}
function call(method, token) {
  return new Promise((resolve) => {
    const headers = token ? { authorization: "Bearer " + token } : {};
    const req = { method, headers, url: "/", get: (h) => headers[h.toLowerCase()], header: (h) => headers[h.toLowerCase()], on() { return this; } };
    const out = { status: 200, headers: {} };
    const res = {
      statusCode: 200,
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, getHeader(k) { return out.headers[k.toLowerCase()]; },
      set(k, v) { this.setHeader(k, v); return this; },
      status(c) { out.status = c; this.statusCode = c; return this; },
      json(b) { out.body = b; resolve(out); }, end() { resolve(out); }, send(b) { out.body = b; resolve(out); },
      on() { return this; }, once() { return this; }, removeListener() { return this; }
    };
    fns.stats(req, res);
  });
}
(async () => {
  const db = admin.firestore();
  const now = Date.now(), iso = (d) => new Date(now - d * 86400000).toISOString();
  await db.doc("users/u1").set({ name: "A", createdAt: iso(3), lastSeen: iso(0).slice(0, 10), activeWeeks: [], updatedAt: iso(1),
    skinProfile: { allergies: ["Parfums"] }, lastRoutine: { steps: [1, 2] } });
  await db.doc("users/u2").set({ name: "B", createdAt: iso(40), lastSeen: iso(35).slice(0, 10) });
  for (let i = 0; i < 6; i++) await db.collection("tolerance_reports").add({ k: "cv-gel", e: "", v: i ? "ok" : "reaction", s: i ? [] : ["rougeurs"], g: "", skin: "mixte", age: "26-35", conc: "", sem: 2, mois: "2026-11" });

  assert.strictEqual((await call("GET")).status, 401);
  assert.strictEqual((await call("GET", "faux-jeton")).status, 401);
  assert.strictEqual((await call("GET", await idToken("user@example.com", true))).status, 403);
  assert.strictEqual((await call("GET", await idToken("admin2@example.com", false))).status, 403);
  const tok = await idToken("admin@example.com", true);
  assert.strictEqual((await call("POST", tok)).status, 405);
  const ok = await call("GET", tok);
  assert.strictEqual(ok.status, 200);
  const b = ok.body;
  assert.deepStrictEqual([b.utilisateurs.total, b.utilisateurs.actifs7, b.utilisateurs.actifs30, b.utilisateurs.avecRoutine], [2, 1, 1, 1]);
  assert.deepStrictEqual([b.tolerance.retours, b.tolerance.produits[0].k, b.tolerance.produits[0].tauxReaction], [6, "cv-gel", 16.7]);
  const txt = JSON.stringify(b);
  assert.ok(!/Parfums|allergies|skinProfile|steps|"name"/.test(txt), "aucune donnée personnelle ou de santé dans la réponse");
  assert.strictEqual(ok.headers["cache-control"], "private, no-store");
  console.log("stats : OK");
  process.exit(0);
})().catch((e) => { console.error(e, e.cause, process.env.FIREBASE_AUTH_EMULATOR_HOST); process.exit(1); });
