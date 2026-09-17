import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAuditEvidenceResponse } from "./auditEvidenceContract.js";

test("normalizzatore response rende ogni problema mostrabile riproducibile", async () => {
  const response = new Response(JSON.stringify({
    url: "https://example.it/pagina",
    fetchedAt: "2026-09-17T09:00:00Z",
    issues: [
      { severity: "alta", label: "Title mancante" },
      { severity: "alta", label: "Title mancante" },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const normalized = await normalizeAuditEvidenceResponse(response);
  const data = await normalized.json();
  assert.equal(data.issues.length, 1);
  assert.equal(data.issues[0].type, "title");
  assert.equal(data.issues[0].evidence.sourceType, "HTML pubblico");
  assert.equal(data.issues[0].evidence.url, "https://example.it/pagina");
  assert.equal(data.issueEvidenceComplete, true);
});
