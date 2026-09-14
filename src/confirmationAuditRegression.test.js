import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { metadataVerificationPatch } from "./metadataCorrectionVerification.js";
import { matchesProblemFocus, problemNavigationFocus } from "./problemNavigationFocus.js";

const page = "https://example.com/pagina/";

test("SERP width verification asks for the correct audit instead of duplicate checking", () => {
  const record = {
    sourceUrl: page,
    issueType: "description-serp-width",
    issueLabel: "Meta description larga nello snippet: circa 960px / 920px",
    after: { "meta.rank_math_description": "Una meta description più compatta e leggibile." },
  };
  const patch = metadataVerificationPatch(record, {
    url: page,
    status: 200,
    verificationSafe: true,
    metaDescriptionCount: 1,
    metaDescription: "Una meta description più compatta e leggibile.",
  });
  assert.equal(patch.frontendConfirmed, true);
  assert.match(patch.verificationNote, /larghezza SERP stimata/i);
  assert.doesNotMatch(patch.verificationNote, /assenza di duplicati/i);
});

test("focus survives a regenerated issue key when type and URL still identify the finding", () => {
  const focus = problemNavigationFocus({
    key: "old-key",
    issueType: "canonical-different",
    title: "Canonical differente dall’URL analizzato",
    sourceUrl: page,
    correctability: "assisted",
  }, 1, 1);
  const refreshed = {
    key: "new-key",
    issueType: "canonical-different",
    title: "Canonical differente dall’URL analizzato",
    sourceUrl: "https://example.com/pagina",
  };
  assert.equal(matchesProblemFocus(refreshed, focus), true);
});

test("broken-link focus remains target scoped when the issue key changes", () => {
  const focus = problemNavigationFocus({
    key: "old-link-key",
    issueType: "broken-external-link",
    title: "Link esterno 404",
    sourceUrl: page,
    targetUrls: ["https://broken.example/one"],
  }, 1, 1);
  assert.equal(matchesProblemFocus({
    key: "new-link-key",
    issueType: "broken-external-link",
    title: "Link esterno 404",
    sourceUrl: page,
    targetUrls: ["https://broken.example/two"],
  }, focus), false);
});

test("explicit verification chains frontend verification into an automatic confirmation audit", async () => {
  const integrity = await readFile(new URL("./remediationIntegrity.js", import.meta.url), "utf8");
  const audit = await readFile(new URL("./confirmationAudit.js", import.meta.url), "utf8");
  assert.match(integrity, /runConfirmationAudit\(result\.record\)/);
  assert.match(integrity, /status: "Verificato"/);
  assert.match(integrity, /needsAudit: !confirmation\.resolved/);
  assert.match(audit, /\/api\/audit/);
  assert.match(audit, /\/api\/site-analysis/);
  assert.match(audit, /reviewItems/);
  assert.match(audit, /sourceCovered/);
});
