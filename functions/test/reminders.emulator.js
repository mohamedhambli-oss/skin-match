// Test de la fonction « reminders » sur l'émulateur Firestore (envoi FCM simulé) :
//   cd firestore-tests && npm test
"use strict";
const assert = require("node:assert");
process.env.GCLOUD_PROJECT = "demo-skinmatch";
const fns = require("../index.js");
const admin = require("firebase-admin");
const envoyes = [];
// FCM n'a pas d'émulateur : l'envoi est remplacé par une simulation.
require("firebase-admin/messaging").Messaging.prototype.sendEach = async (msgs) => ({ responses: msgs.map((m) => {
  envoyes.push(m);
  return m.token === "perime" ? { success: false, error: { code: "messaging/registration-token-not-registered" } }
       : m.token === "panne" ? { success: false, error: { code: "messaging/internal-error" } } : { success: true };
}) });
(async () => {
  const db = admin.firestore();
  const now = (x) => ({ token: x.token, lang: x.lang || "fr", matin: x.matin || null, soir: x.soir || null, updatedAt: "x" });
  await db.doc("push/a").set(now({ token: "ta", matin: "0700" }));
  await db.doc("push/b").set(now({ token: "tb", soir: "0700", lang: "en" }));
  await db.doc("push/c").set(now({ token: "tc", matin: "0715" }));
  await db.doc("push/d").set(now({ token: "perime", matin: "0700" }));
  await db.doc("push/e").set(now({ token: "panne", soir: "0700" }));
  await fns.reminders.run({ scheduleTime: "2026-11-26T07:05:00Z" });
  const parToken = Object.fromEntries(envoyes.map((m) => [m.token, m.data]));
  assert.deepStrictEqual(parToken.ta, { type: "matin", lang: "fr" });
  assert.deepStrictEqual(parToken.tb, { type: "soir", lang: "en" });
  assert.strictEqual(parToken.tc, undefined, "créneau 07:15 non concerné");
  assert.strictEqual((await db.doc("push/d").get()).exists, false, "jeton périmé supprimé");
  assert.strictEqual((await db.doc("push/e").get()).exists, true, "erreur passagère : abonnement conservé");
  assert.strictEqual(envoyes.length, 4);
  await fns.cleanupDeletedUser.run({ uid: "a" });
  assert.strictEqual((await db.doc("push/a").get()).exists, false, "suppression de compte : abonnement effacé");
  console.log("reminders : OK");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
