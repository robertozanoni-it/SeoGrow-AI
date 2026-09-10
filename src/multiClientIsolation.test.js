import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { correctionCredentials } from "./correctionCredentials.js";

const apiSource = await readFile(new URL("./api.js", import.meta.url), "utf8");
const correctionsSource = await readFile(new URL("./CorrectionsWorkspace.jsx", import.meta.url), "utf8");

const record = {
  clientId: 4,
  siteUrl: "https://a.example/",
};

test("all client-sensitive audit, WordPress and slow API paths are project-scoped", () => {
  for (const expected of [
    "/api/dataforseo/",
    "/api/geo/simulate",
    "/api/generate",
    "/api/audit",
    "/api/site-analysis",
    "/api/frontend/inspect",
    "/api/wordpress/",
  ]) {
    assert.match(apiSource, new RegExp(expected.replaceAll("/", "\\/")));
  }
  assert.match(apiSource, /const projectScoped = isProjectScopedRequest\(inputText\)/);
  assert.match(apiSource, /normalizeClientId\(JSON\.parse\(localStorage\.getItem\(SELECTED_CLIENT_KEY\)\)\)/);
});

test("project switch invalidates an in-flight response before it can be consumed", () => {
  assert.match(apiSource, /assertProjectStillSelected\(scopeEntry\);\s*if \(signal\.aborted\)/s);
  assert.match(apiSource, /const normalized = await normalizeGdprResponse[\s\S]*assertProjectStillSelected\(scopeEntry\);\s*return normalized;/);
  assert.match(apiSource, /!entry\.clientId \|\| entry\.clientId !== current/);
});

test("project-scoped calls cannot start without a valid positive client id", () => {
  assert.match(apiSource, /if \(!entry\) return;/);
  assert.match(apiSource, /entry\.clientId && current === entry\.clientId/);
  assert.match(apiSource, /Progetto non selezionato/);
});

test("correction credentials reject another client or another WordPress site", () => {
  assert.throws(() => correctionCredentials(record, {
    clientId: 5,
    siteUrl: "https://a.example/",
    username: "user-a",
    applicationPassword: "secret-a",
  }), /cliente della correzione/);

  assert.throws(() => correctionCredentials(record, {
    clientId: 4,
    siteUrl: "https://b.example/",
    username: "user-a",
    applicationPassword: "secret-a",
  }), /non coincide/);

  assert.deepEqual(correctionCredentials(record, {
    clientId: 4,
    siteUrl: "https://a.example/",
    username: "user-a",
    applicationPassword: "secret-a",
  }), {
    siteUrl: "https://a.example/",
    username: "user-a",
    applicationPassword: "secret-a",
  });
});

test("rollback password remains bound to the selected client", () => {
  assert.match(correctionsSource, /passwordEntry\?\.clientId === selectedClientId \? passwordEntry\.value : ""/);
  assert.match(correctionsSource, /setPasswordEntry\(\{ clientId: selectedClientId, value \}\)/);
  assert.match(correctionsSource, /Number\(record\.clientId\) !== selectedClientId/);
  assert.match(correctionsSource, /selectedClientId !== Number\(readJson\(SELECTED_CLIENT_KEY, 0\)\)/);
});
