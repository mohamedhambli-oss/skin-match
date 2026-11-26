// App Check sur le proxy IA (émulateur Auth) : cd firestore-tests && npm test
"use strict";
const assert = require("node:assert");
process.env.GCLOUD_PROJECT = "demo-skinmatch";
const fns = require("../index.js");
const admin = require("firebase-admin");
async function idToken() {
  await admin.auth().createUser({ email: "ac@example.com", password: "secret123", emailVerified: true }).catch(() => {});
  const r = await fetch("http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "ac@example.com", password: "secret123", returnSecureToken: true }) });
  return (await r.json()).idToken;
}
function call(token, extra) {
  return new Promise((resolve) => {
    const headers = Object.assign({ authorization: "Bearer " + token, "content-type": "application/json" }, extra || {});
    const req = { method: "POST", headers, url: "/", body: { task: "inconnue" }, get: (h) => headers[h.toLowerCase()], header: (h) => headers[h.toLowerCase()], on() { return this; } };
    const out = { status: 200, headers: {} };
    const res = { statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, getHeader(k) { return out.headers[k.toLowerCase()]; },
      set(k, v) { this.setHeader(k, v); return this; }, status(c) { out.status = c; this.statusCode = c; return this; },
      json(b) { out.body = b; resolve(out); }, end() { resolve(out); }, send(b) { out.body = b; resolve(out); }, on() { return this; }, once() { return this; }, removeListener() { return this; } };
    fns.gemini(req, res);
  });
}
(async () => {
  const tok = await idToken();
  process.env.APPCHECK_MODE = "enforce";
  let r = await call(tok);
  assert.deepStrictEqual([r.status, r.body.error], [401, "appcheck"], "enforce sans jeton : refusé");
  r = await call(tok, { "x-firebase-appcheck": "faux-jeton" });
  assert.deepStrictEqual([r.status, r.body.error], [401, "appcheck"], "enforce, jeton invalide : refusé");
  process.env.APPCHECK_MODE = "monitor";
  r = await call(tok);
  assert.deepStrictEqual([r.status, r.body.error], [400, "bad_request"], "monitor : laissé passer jusqu'à la validation");
  console.log("App Check : OK");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
