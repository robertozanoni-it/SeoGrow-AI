import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeInternalLinkSuggestions,
  validateInternalLinkSuggestion,
  insertInternalLinkIntoHtml,
  buildInternalLinkPatch,
  assessInternalLinkPreflight,
  assessInternalLinkVerification,
} from "./modules/links/internalLinkRemediation.js";

const suggestion = (extra = {}) => ({
  sourceUrl: "https://example.com/guida/",
  targetUrl: "https://example.com/servizi/seo/",
  anchor: "consulenza SEO locale",
  reason: "Titoli e percorsi condividono i temi: seo, locale. Verificare che il passaggio sia naturale nel testo sorgente.",
  ...extra,
});

test("internal link suggestions reject self-links, external targets, weak anchors and duplicates", () => {
  assert.throws(() => validateInternalLinkSuggestion(suggestion({ targetUrl: "https://example.com/guida/" })), error => error.code === "SELF_LINK");
  assert.throws(() => validateInternalLinkSuggestion(suggestion({ targetUrl: "https://other.example/seo/" })), error => error.code === "EXTERNAL_TARGET");
  assert.throws(() => validateInternalLinkSuggestion(suggestion({ anchor: "SEO" })), error => error.code === "WEAK_ANCHOR");
  const result = analyzeInternalLinkSuggestions([suggestion(), suggestion({ anchor: "servizi SEO professionali" })]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.rejected[0].code, "DUPLICATE_SUGGESTION");
});

test("core content insertion wraps one exact text occurrence and preserves the rest", () => {
  const before = "<p>Per crescere serve una consulenza SEO locale costruita sui dati.</p><p>Altro testo.</p>";
  const result = insertInternalLinkIntoHtml(before, suggestion());
  assert.match(result.after, /<a href="https:\/\/example\.com\/servizi\/seo">consulenza SEO locale<\/a>/);
  assert.equal((result.after.match(/<a\b/g) || []).length, 1);
  assert.match(result.after, /Altro testo/);
});

test("automatic insertion refuses existing target links, ambiguous anchors and anchors already inside links", () => {
  assert.throws(() => insertInternalLinkIntoHtml('<p><a href="/servizi/seo/">consulenza SEO locale</a></p>', suggestion()), error => error.code === "LINK_ALREADY_EXISTS");
  assert.throws(() => insertInternalLinkIntoHtml("<p>consulenza SEO locale e poi consulenza SEO locale.</p>", suggestion()), error => error.code === "ANCHOR_AMBIGUOUS");
  assert.throws(() => insertInternalLinkIntoHtml('<p><a href="/altro/">consulenza SEO locale</a></p>', suggestion()), error => error.code === "ANCHOR_NOT_FOUND");
});

test("Elementor patch changes only the unique local text-editor and keeps rollback-ready document state", () => {
  const data = [{ id: "a1", widgetType: "text-editor", settings: { editor: "<p>Scopri la nostra consulenza SEO locale per attività locali.</p>" }, elements: [] }];
  const entity = { id: 44, content: { raw: "" }, meta: { _elementor_data: JSON.stringify(data) } };
  const patch = buildInternalLinkPatch(entity, suggestion());
  assert.equal(patch.adapter, "Elementor text-editor");
  assert.deepEqual(Object.keys(patch.changes.meta), ["_elementor_data"]);
  const parsed = JSON.parse(patch.changes.meta._elementor_data);
  assert.match(parsed[0].settings.editor, /href="https:\/\/example\.com\/servizi\/seo"/);
  assert.equal(data[0].settings.editor.includes("href="), false);
});

test("core WordPress patch is deterministic and only changes post_content", () => {
  const entity = { id: 12, content: { raw: "<p>Una consulenza SEO locale può migliorare la struttura del sito.</p>" }, meta: {} };
  const patch = buildInternalLinkPatch(entity, suggestion());
  assert.equal(patch.adapter, "WordPress post_content");
  assert.deepEqual(Object.keys(patch.changes), ["content"]);
  assert.match(patch.changes.content, /<a href=/);
});

test("preflight requires safe full-page evidence and proves absence before preview", () => {
  assert.equal(assessInternalLinkPreflight({ ok: true, verificationSafe: true, scanComplete: true, occurrenceCount: 0 }).ok, true);
  assert.equal(assessInternalLinkPreflight({ ok: true, verificationSafe: true, scanComplete: true, occurrenceCount: 1 }).code, "LINK_ALREADY_EXISTS");
  assert.equal(assessInternalLinkPreflight({ ok: true, verificationSafe: false, scanComplete: true, occurrenceCount: 0 }).code, "EVIDENCE_UNSAFE");
});

test("post-apply verification requires exactly one link and the approved anchor", () => {
  const verified = assessInternalLinkVerification({ ok: true, verificationSafe: true, scanComplete: true, occurrenceCount: 1, anchorText: "Consulenza SEO locale" }, "consulenza SEO locale");
  assert.equal(verified.ok, true);
  assert.equal(assessInternalLinkVerification({ ok: true, verificationSafe: true, scanComplete: true, occurrenceCount: 2, anchorText: "consulenza SEO locale" }, "consulenza SEO locale").code, "DUPLICATE_LINK");
  assert.equal(assessInternalLinkVerification({ ok: true, verificationSafe: true, scanComplete: true, occurrenceCount: 1, anchorText: "SEO" }, "consulenza SEO locale").code, "ANCHOR_MISMATCH");
});
