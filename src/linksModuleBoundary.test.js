import test from "node:test";
import assert from "node:assert/strict";
import {
  linksManifest,
  internalLinkSuggestions,
  brokenInternalLinks,
  brokenExternalLinks,
  orphanPages,
} from "./modules/links/index.js";

test("Links facade espone le capability dichiarate dal modulo", () => {
  assert.equal(linksManifest.id, "links");
  assert.equal(linksManifest.status, "active");
  assert.equal(linksManifest.agentEnabled, true);
  assert.deepEqual(linksManifest.capabilities, ["internal-links", "broken-links", "anchor-analysis"]);
});

test("Links legge l'evidenza Audit senza copiarla o mutarla", () => {
  const suggestions = [{ sourceUrl: "/a", targetUrl: "/b" }];
  const broken = [{ url: "/missing" }];
  const external = [{ url: "https://other.example/missing" }];
  const orphans = [{ url: "/orphan" }];
  const analysis = {
    internalLinkSuggestions: suggestions,
    brokenLinks: broken,
    brokenExternalLinks: external,
    orphanPages: orphans,
  };

  assert.equal(internalLinkSuggestions(analysis), suggestions);
  assert.equal(brokenInternalLinks(analysis), broken);
  assert.equal(brokenExternalLinks(analysis), external);
  assert.equal(orphanPages(analysis), orphans);
  assert.deepEqual(internalLinkSuggestions(null), []);
  assert.deepEqual(brokenInternalLinks({ brokenLinks: null }), []);
});
