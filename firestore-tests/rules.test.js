// Tests des règles Firestore (firestore.rules) sur l'émulateur : npm test
"use strict";
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, addDoc } = require("firebase/firestore");

let env;
const NOW = new Date().toISOString();

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-skinmatch",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8") }
  });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); });

const alice = () => env.authenticatedContext("alice", { email: "alice@example.com" }).firestore();
const bob = () => env.authenticatedContext("bob", { email: "bob@example.com" }).firestore();
const guest = () => env.unauthenticatedContext().firestore();

const profile = { name: "Alice", email: "alice@example.com", createdAt: NOW, skinProfile: null, lastRoutine: null,
  consentVersion: "1.0", consentAcceptedAt: NOW, cguAcceptedAt: NOW };

test("users : création, lecture, mise à jour et suppression par le titulaire", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "users/alice"), profile));
  await assertSucceeds(getDoc(doc(db, "users/alice")));
  await assertSucceeds(updateDoc(doc(db, "users/alice"), { lastRoutine: { a: 1 }, skinProfile: { skinType: "mixte" }, updatedAt: NOW }));
  await assertSucceeds(setDoc(doc(db, "users/alice"), { routineHistory: [{ date: NOW }] }, { merge: true }));
  await assertSucceeds(updateDoc(doc(db, "users/alice"), { "feedback.cerave-gel": { type: "up", date: NOW } }));
  await assertSucceeds(setDoc(doc(db, "users/alice"), { lastReview: { date: 1, answers: [] } }, { merge: true }));
  await assertSucceeds(deleteDoc(doc(db, "users/alice")));
});

test("users : inaccessible aux autres et aux visiteurs", async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "users/alice"), profile));
  await assertFails(getDoc(doc(bob(), "users/alice")));
  await assertFails(getDoc(doc(guest(), "users/alice")));
  await assertFails(updateDoc(doc(bob(), "users/alice"), { name: "pirate" }));
  await assertFails(deleteDoc(doc(bob(), "users/alice")));
  await assertFails(getDocs(collection(alice(), "users")));          // pas de listing global
});

test("users : champs inconnus, faux e-mail et historique trop long refusés", async () => {
  const db = alice();
  await assertFails(setDoc(doc(db, "users/alice"), { ...profile, isPremium: true }));
  await assertFails(setDoc(doc(db, "users/alice"), { ...profile, email: "autre@example.com" }));
  await assertFails(setDoc(doc(db, "users/alice"), { ...profile, routineHistory: new Array(11).fill({}) }));
});

test("community_eans : lecture publique par code, pas de listing", async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    setDoc(doc(c.firestore(), "community_eans/3600000000001"), { ean: "3600000000001", nom: "Gel", marque: "X", addedBy: "bob", addedAt: NOW, validated: false }));
  await assertSucceeds(getDoc(doc(guest(), "community_eans/3600000000001")));
  await assertFails(getDocs(collection(guest(), "community_eans")));
  await assertFails(getDocs(collection(alice(), "community_eans")));
  await assertSucceeds(getDocs(query(collection(bob(), "community_eans"), where("addedBy", "==", "bob"))));
});

test("community_eans : création encadrée, jamais d'écrasement", async () => {
  const ok = { ean: "3600000000002", nom: "Crème", marque: "Y", addedBy: "alice", addedAt: NOW, validated: false };
  await assertFails(setDoc(doc(guest(), "community_eans/3600000000002"), { ...ok, addedBy: "anonymous" }));
  await assertFails(setDoc(doc(alice(), "community_eans/3600000000002"), { ...ok, validated: true }));
  await assertFails(setDoc(doc(alice(), "community_eans/3600000000002"), { ...ok, addedBy: "bob" }));
  await assertFails(setDoc(doc(alice(), "community_eans/3600000000002"), { ...ok, productKey: "cerave" }));
  await assertFails(setDoc(doc(alice(), "community_eans/abc"), { ...ok, ean: "abc" }));
  await assertFails(setDoc(doc(alice(), "community_eans/3600000000002"), { ...ok, nom: "x".repeat(121) }));
  await assertSucceeds(setDoc(doc(alice(), "community_eans/3600000000002"), ok));
  await assertFails(setDoc(doc(bob(), "community_eans/3600000000002"), { ...ok, addedBy: "bob" }));   // écrasement
  await assertFails(deleteDoc(doc(bob(), "community_eans/3600000000002")));
  await assertSucceeds(deleteDoc(doc(alice(), "community_eans/3600000000002")));
});

test("ai_usage et collections inconnues : refusés", async () => {
  await assertFails(getDoc(doc(alice(), "ai_usage/alice")));
  await assertFails(setDoc(doc(alice(), "ai_usage/alice"), { day: "2026-11-24", skin: 0 }));
  await assertFails(setDoc(doc(alice(), "anything/x"), { a: 1 }));
  await assertSucceeds(deleteDoc(doc(alice(), "routines/alice")));
  await assertFails(deleteDoc(doc(bob(), "routines/alice")));
});

test("tolerance : champ du profil et rapports anonymes encadrés", async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, "users/alice"), { ...profile, tolerance: { "cv-gel": { v: "reaction", s: ["rougeurs"] } } }));
  const ok = { k: "cv-gel", e: "3337875597197", v: "reaction", s: ["rougeurs"], g: "legere", skin: "mixte", age: "26-35", conc: "acne", sem: 2, mois: "2026-11" };
  await assertSucceeds(addDoc(collection(db, "tolerance_reports"), ok));
  await assertFails(addDoc(collection(guest(), "tolerance_reports"), ok));                 // compte requis
  await assertFails(addDoc(collection(db, "tolerance_reports"), { ...ok, uid: "alice" }));  // aucun identifiant
  await assertFails(addDoc(collection(db, "tolerance_reports"), { ...ok, v: "super" }));
  await assertFails(addDoc(collection(db, "tolerance_reports"), { ...ok, mois: "2026-11-25" }));
  await assertFails(getDocs(collection(db, "tolerance_reports")));                          // pas de lecture
});
