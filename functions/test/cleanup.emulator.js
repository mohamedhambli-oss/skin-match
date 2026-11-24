// Test de cleanupDeletedUser sur l'émulateur Firestore :
//   cd firestore-tests && npm test   (lancé après les tests des règles)
"use strict";
const assert = require("node:assert");
process.env.GCLOUD_PROJECT = "demo-skinmatch";
const fns = require("../index.js");
const admin = require("firebase-admin");
(async () => {
  const db = admin.firestore();
  await db.doc("users/alice").set({ name: "Alice" });
  await db.doc("ai_usage/alice").set({ day: "2026-11-24", skin: 1 });
  await db.doc("community_eans/111").set({ addedBy: "alice", validated: false });
  await db.doc("community_eans/222").set({ addedBy: "alice", validated: true, nom: "Gel" });
  await db.doc("community_eans/333").set({ addedBy: "bob", validated: false });
  await fns.cleanupDeletedUser.run({ uid: "alice" });
  assert.strictEqual((await db.doc("users/alice").get()).exists, false);
  assert.strictEqual((await db.doc("ai_usage/alice").get()).exists, false);
  assert.strictEqual((await db.doc("community_eans/111").get()).exists, false);
  assert.strictEqual((await db.doc("community_eans/222").get()).get("addedBy"), "deleted-user");
  assert.strictEqual((await db.doc("community_eans/333").get()).get("addedBy"), "bob");
  console.log("cleanupDeletedUser : OK");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
