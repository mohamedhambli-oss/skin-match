// Tests des rappels envoyés par le serveur : cd functions && npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const r = require("../reminders-core");

test("créneau UTC au quart d'heure inférieur", () => {
  assert.strictEqual(r.slotOf("2026-11-26T07:00:00Z"), "0700");
  assert.strictEqual(r.slotOf("2026-11-26T07:14:59Z"), "0700");
  assert.strictEqual(r.slotOf("2026-11-26T20:45:10Z"), "2045");
  assert.strictEqual(r.slotOf("2026-11-26T23:59:00Z"), "2345");
});

test("validation des créneaux", () => {
  ["0000", "0715", "2030", "2345"].forEach((s) => assert.ok(r.isSlot(s), s));
  ["2400", "0710", "7:00", "", null, 700, "07000"].forEach((s) => assert.ok(!r.isSlot(s), String(s)));
});

test("message : données seules, langue par défaut, rien d'autre que le type", () => {
  const m = r.buildMessage({ token: "abc", lang: "en", matin: "0700", soir: null }, "soir");
  assert.deepStrictEqual(m.data, { type: "soir", lang: "en" });
  assert.strictEqual(m.token, "abc");
  assert.strictEqual(m.notification, undefined);
  assert.strictEqual(m.webpush.headers.TTL, "3600");
  assert.deepStrictEqual(r.buildMessage({ token: "x", lang: "de" }, "matin").data, { type: "matin", lang: "fr" });
  assert.strictEqual(r.buildMessage({ token: "" }, "matin"), null);
  assert.strictEqual(r.buildMessage({ token: "x" }, "midi"), null);
  assert.strictEqual(r.buildMessage(null, "matin"), null);
});

test("jetons périmés reconnus", () => {
  assert.ok(r.isDeadToken("messaging/registration-token-not-registered"));
  assert.ok(!r.isDeadToken("messaging/internal-error"));
});
