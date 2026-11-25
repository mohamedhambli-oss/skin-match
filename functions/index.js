// Proxy Gemini de SkinMatch (Cloud Functions 2e génération, région UE).
//
// Pourquoi : une clé d'API placée dans le navigateur (même dans un config.js non commité)
// est lisible par n'importe quel visiteur. Ici la clé reste dans Secret Manager, chaque
// appel exige un utilisateur Firebase connecté, et chaque utilisateur a un quota quotidien.
//
// Déploiement :
//   firebase functions:secrets:set GEMINI_KEY      (coller la NOUVELLE clé)
//   firebase deploy --only functions
"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const core = require("./gemini-core");
const stats = require("./stats-core");

admin.initializeApp();

const GEMINI_KEY = defineSecret("GEMINI_KEY");
const GEMINI_MODEL = defineString("GEMINI_MODEL", { default: "gemini-2.5-flash" });

// Origines autorisées à appeler le proxy depuis un navigateur.
const ALLOWED_ORIGINS = [
  "https://skin-match-c7189.web.app",
  "https://skin-match-c7189.firebaseapp.com",
  "https://mohamedhambli-oss.github.io",
  "https://skin-match-test.netlify.app",
  /^http:\/\/localhost(:\d+)?$/
];

exports.gemini = onRequest({
  region: "europe-west1",
  secrets: [GEMINI_KEY],
  cors: ALLOWED_ORIGINS,
  maxInstances: 5,
  timeoutSeconds: 30,
  memory: "256MiB"
}, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }

  // 1. Utilisateur Firebase obligatoire
  const m = String(req.get("Authorization") || "").match(/^Bearer (.+)$/);
  if (!m) { res.status(401).json({ error: "auth" }); return; }
  let uid;
  try { uid = (await admin.auth().verifyIdToken(m[1])).uid; }
  catch (e) { res.status(401).json({ error: "auth" }); return; }

  // 2. Requête limitée à une tâche connue
  let parsed;
  try { parsed = core.validateRequest(req.body); }
  catch (e) { res.status(400).json({ error: "bad_request" }); return; }

  // 3. Quota quotidien (transaction : pas de dépassement par appels simultanés)
  const ref = admin.firestore().doc("ai_usage/" + uid);
  const today = new Date().toISOString().slice(0, 10);
  const allowed = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = core.nextUsage(snap.exists ? snap.data() : null, parsed.task, today);
    if (!next) return false;
    tx.set(ref, next);
    return true;
  });
  if (!allowed) { res.status(429).json({ error: "quota" }); return; }

  // 4. Appel Gemini — la clé passe dans un en-tête, jamais dans l'URL
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL.value()) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY.value() },
      body: JSON.stringify(core.buildGeminiBody(parsed, GEMINI_MODEL.value()))
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      logger.error("gemini_error", { status: r.status, code: data.error && data.error.code });
      res.status(502).json({ error: "upstream" });
      return;
    }
    const result = core.sanitizeResult(parsed, core.extractText(data));
    if (!result) { res.status(502).json({ error: "invalid_output" }); return; }
    // Ni l'image ni le texte saisi ne sont journalisés (données de santé).
    res.json(result);
  } catch (e) {
    logger.error("gemini_fetch_failed", { message: e.message });
    res.status(502).json({ error: "upstream" });
  }
});

// Tableau de bord (admin.html) : indicateurs agrégés, réservés aux administrateurs.
// Liste des e-mails autorisés (e-mail vérifié obligatoire), réglée au déploiement :
//   ADMIN_EMAILS=moi@exemple.fr,associe@exemple.fr   (fichier functions/.env, non commité)
// Seuls des champs non sensibles sont lus : dates d'inscription et d'activité.
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "" });
exports.stats = onRequest({
  region: "europe-west1",
  cors: ALLOWED_ORIGINS,
  maxInstances: 2,
  timeoutSeconds: 60,
  memory: "512MiB"
}, async (req, res) => {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const m = String(req.get("Authorization") || "").match(/^Bearer (.+)$/);
  if (!m) { res.status(401).json({ error: "auth" }); return; }
  let token;
  try { token = await admin.auth().verifyIdToken(m[1]); }
  catch (e) { res.status(401).json({ error: "auth" }); return; }
  if (!stats.isAdmin(token, ADMIN_EMAILS.value())) { res.status(403).json({ error: "forbidden" }); return; }

  try {
    const db = admin.firestore();
    const [u, r] = await Promise.all([
      db.collection("users").select("createdAt", "lastSeen", "activeWeeks", "updatedAt").get(),
      db.collection("tolerance_reports").select("k", "v", "s", "g", "sem").get()
    ]);
    const users = u.docs.map((d) => ({ createdAt: d.get("createdAt"), lastSeen: d.get("lastSeen"),
      activeWeeks: d.get("activeWeeks"), hasRoutine: !!d.get("updatedAt") }));
    res.set("Cache-Control", "private, no-store");
    res.json(stats.computeStats({ users, reports: r.docs.map((d) => d.data()), now: new Date() }));
  } catch (e) {
    logger.error("stats_failed", { message: e.message });
    res.status(500).json({ error: "internal" });
  }
});

// Suppression de compte : efface côté serveur ce que le client ne peut pas (ou n'a pas pu)
// effacer — profil, quotas IA, contributions non validées — et anonymise les contributions
// déjà validées, intégrées à la base produits.
const functionsV1 = require("firebase-functions/v1");
exports.cleanupDeletedUser = functionsV1.region("europe-west1").auth.user().onDelete(async (user) => {
  const db = admin.firestore();
  const uid = user.uid;
  const batch = db.batch();
  batch.delete(db.doc("users/" + uid));
  batch.delete(db.doc("ai_usage/" + uid));
  batch.delete(db.doc("routines/" + uid));
  batch.delete(db.doc("feedbacks/" + uid));
  const contribs = await db.collection("community_eans").where("addedBy", "==", uid).get();
  contribs.forEach((d) => {
    if (d.get("validated") === true) batch.update(d.ref, { addedBy: "deleted-user" });
    else batch.delete(d.ref);
  });
  await batch.commit();
  logger.info("user_data_deleted", { contributions: contribs.size });
});
