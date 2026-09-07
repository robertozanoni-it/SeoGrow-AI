import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../server/wordpressWriteReconciliationHook.js";
import { recoveryPayload } from "./writeRecovery.js";

const entity = (title) => ({ id: 8188, title: { raw: title }, content: { raw: "Body" }, excerpt: { raw: "" } });

test("reconciliation classifies exact after as APPLIED", () => {
  const result = classify(entity("After"), ["title"], { title: "Before" }, { title: "After" });
  assert.equal(result.classification, "APPLIED");
  assert.equal(result.current.title, "After");
});

test("reconciliation classifies exact before as NOT_APPLIED", () => {
  const result = classify(entity("Before"), ["title"], { title: "Before" }, { title: "After" });
  assert.equal(result.classification, "NOT_APPLIED");
});

test("reconciliation keeps third-party state as DIVERGED", () => {
  const result = classify(entity("External"), ["title"], { title: "Before" }, { title: "After" });
  assert.equal(result.classification, "DIVERGED");
});

test("recovery payload is limited to uncertain core-field writes", () => {
  const base = {
    id: "corr-1",
    clientId: 1,
    status: "Esito incerto",
    writeConfirmed: false,
    resource: "pages",
    entityId: 8188,
    sourceUrl: "https://example.it/?page_id=8188",
    fields: ["title"],
    before: { title: "Before" },
    after: { title: "After" },
    siteUrl: "https://example.it",
    username: "qa",
  };
  const payload = recoveryPayload(base, { clientId: 1, siteUrl: "https://example.it", username: "qa", applicationPassword: "app-pass" });
  assert.equal(payload.id, 8188);
  assert.equal(payload.resource, "pages");
  assert.deepEqual(payload.fields, ["title"]);
  assert.throws(() => recoveryPayload({ ...base, fields: ["meta.rank_math_title"], before: { "meta.rank_math_title": "A" }, after: { "meta.rank_math_title": "B" } }, { clientId: 1, siteUrl: "https://example.it", username: "qa", applicationPassword: "app-pass" }), /solo per title\/content\/excerpt/);
  assert.throws(() => recoveryPayload({ ...base, status: "Da verificare" }, { clientId: 1, siteUrl: "https://example.it", username: "qa", applicationPassword: "app-pass" }), /non richiede riconciliazione/);
});
