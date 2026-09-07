import test from "node:test";
import assert from "node:assert/strict";
import { correctionCredentials } from "./correctionCredentials.js";

const record = { clientId: 1, siteUrl: "https://example.it/blog/" };
const credentials = { clientId: 1, siteUrl: "https://example.it/blog", username: "editor", applicationPassword: "test-only" };

test("riverifica senza credenziali esplicite non usa la password del cliente visibile", () => {
  assert.throws(() => correctionCredentials(record), /cliente/);
  assert.throws(() => correctionCredentials(record, { ...credentials, clientId: 2 }), /cliente/);
});

test("credenziali non attraversano host o installazioni WordPress", () => {
  for (const siteUrl of ["https://other.it/blog", "https://example.it", "http://example.it/blog", "https://user@example.it/blog"]) {
    assert.throws(() => correctionCredentials(record, { ...credentials, siteUrl }));
  }
});

test("credenziali esplicite dello stesso cliente e installazione sono accettate", () => {
  assert.deepEqual(correctionCredentials(record, credentials), {
    siteUrl: credentials.siteUrl, username: "editor", applicationPassword: "test-only",
  });
  assert.throws(() => correctionCredentials(record, { ...credentials, applicationPassword: "" }), /password/);
});
