import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, model, moduleIndex, appMain, crawler, suggestionRanker] = await Promise.all([
  readFile(new URL("./InternalLinksWorkspaceLayer.jsx", import.meta.url), "utf8"),
  readFile(new URL("./modules/links/internalLinkRemediation.js", import.meta.url), "utf8"),
  readFile(new URL("./modules/links/index.js", import.meta.url), "utf8"),
  readFile(new URL("./appMain.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server/index.js", import.meta.url), "utf8"),
  readFile(new URL("../server/internalLinkSuggestionRanker.js", import.meta.url), "utf8"),
]);

test("Link interni exposes source, destination, anchor, reason and complete remediation actions", () => {
  for (const label of ["Pagina sorgente", "Destinazione", "Anchor suggerita", "Motivazione", "Preview", "Apply", "Verify", "Rollback"])
    assert.match(workspace, new RegExp(label));
  assert.match(workspace, /beforeSnippet/);
  assert.match(workspace, /afterSnippet/);
});

test("internal link apply rechecks current frontend evidence immediately before the atomic write", () => {
  const applyBlock = workspace.slice(workspace.indexOf("const apply = async"), workspace.indexOf("const verify = async"));
  assert.match(applyBlock, /inspectLinkEvidence\(suggestion\.sourceUrl, suggestion\.targetUrl\)/);
  assert.match(applyBlock, /assessInternalLinkPreflight\(latestEvidence\)/);
  assert.match(applyBlock, /createWordPressCorrection/);
  assert.match(applyBlock, /applyPreparedCorrection/);
});

test("verification requires one public link with the exact approved anchor and persists evidence", () => {
  assert.match(model, /count !== 1/);
  assert.match(model, /ANCHOR_MISMATCH/);
  assert.match(workspace, /internalLinkEvidence: evidence/);
  assert.match(workspace, /status: "Verificato"/);
});

test("rollback stays on the canonical Corrections journal instead of introducing a second writer", () => {
  assert.match(workspace, /writeCorrectionsWorkflowContext/);
  assert.match(workspace, /navigatePage\("Correzioni"\)/);
  assert.doesNotMatch(workspace, /\/api\/wordpress\/rollback/);
});

test("duplicate and incoherent auto-links are fail-closed at crawl and remediation boundaries", () => {
  assert.match(crawler, /rankInternalLinkSuggestions/);
  assert.match(suggestionRanker, /source\.url === target\.url/);
  assert.match(suggestionRanker, /linkedPairs\.has\(`\$\{source\.url\}\|\$\{target\.url\}`\)/);
  assert.match(model, /DUPLICATE_SUGGESTION/);
  assert.match(model, /SELF_LINK/);
  assert.match(model, /WEAK_ANCHOR/);
  assert.match(model, /ANCHOR_AMBIGUOUS/);
  assert.match(model, /LINK_ALREADY_EXISTS/);
});

test("Links facade owns the safe remediation contract and the workspace is mounted once", () => {
  assert.match(moduleIndex, /internalLinkRemediation/);
  assert.match(appMain, /import InternalLinksWorkspaceLayer from '\.\/InternalLinksWorkspaceLayer'/);
  assert.equal((appMain.match(/<InternalLinksWorkspaceLayer \/>/g) || []).length, 1);
});
