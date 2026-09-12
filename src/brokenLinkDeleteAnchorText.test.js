import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BROKEN_LINK_CLEANUP_MODES,
  brokenLinkCleanupMode,
  clearBrokenLinkCleanupMode,
  prepareElementorBrokenExternalLink,
  removeExactAnchor,
  setBrokenLinkCleanupMode,
} from "./brokenLinkRemediation.js";

const target = "https://example.com/missing-resource/";

test("delete-anchor-text elimina sia il link sia il testo associato", () => {
  const source = `<p>Prima <a href="${target}"><strong>guida avanzata</strong></a> dopo.</p>`;
  const result = removeExactAnchor(source, target, BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT);
  assert.equal(result.action, "delete-anchor-text");
  assert.equal(result.count, 1);
  assert.deepEqual(result.anchors, ["guida avanzata"]);
  assert.doesNotMatch(result.value, /example\.com|guida avanzata|<a\b/i);
  assert.match(result.value, /<p>Prima\s+\s*dopo\.<\/p>/);
});

test("unlink-preserve-text resta il comportamento predefinito e mantiene il markup interno", () => {
  clearBrokenLinkCleanupMode(target);
  const source = `<p><a href="${target}"><em>guida avanzata</em></a></p>`;
  const result = removeExactAnchor(source, target);
  assert.equal(result.action, "unlink-preserve-text");
  assert.doesNotMatch(result.value, /<a\b|example\.com/i);
  assert.match(result.value, /<em>guida avanzata<\/em>/);
});

test("la scelta distruttiva è one-shot e non resta armata per una seconda correzione", () => {
  const raw = JSON.stringify([{ id: "w1", settings: { editor: `<p>Prima <a href="${target}">guida avanzata</a> dopo.</p>` }, elements: [] }]);
  assert.equal(setBrokenLinkCleanupMode(target, "delete-anchor-text"), true);
  assert.equal(brokenLinkCleanupMode(target), "delete-anchor-text");

  const deleted = prepareElementorBrokenExternalLink(raw, target);
  assert.equal(deleted.action, "delete-anchor-text");
  assert.equal(deleted.count, 1);
  assert.doesNotMatch(deleted.serialized, /guida avanzata|example\.com/);
  assert.equal(brokenLinkCleanupMode(target), "unlink-preserve-text");

  const preserved = prepareElementorBrokenExternalLink(raw, target);
  assert.equal(preserved.action, "unlink-preserve-text");
  assert.match(preserved.serialized, /guida avanzata/);
});

test("su post_content la scelta distruttiva viene consumata una sola volta", () => {
  clearBrokenLinkCleanupMode(target);
  setBrokenLinkCleanupMode(target, BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT);
  const first = removeExactAnchor(`<a href="${target}">prima</a>`, target);
  const second = removeExactAnchor(`<a href="${target}">seconda</a>`, target);
  assert.equal(first.action, "delete-anchor-text");
  assert.equal(first.value, "");
  assert.equal(second.action, "unlink-preserve-text");
  assert.equal(second.value, "seconda");
});

test("la UI espone entrambe le risoluzioni, limita la scelta a una preview e conferma la rimozione distruttiva", async () => {
  const ux = await readFile(new URL("./BrokenLinkCleanupChoiceUx.js", import.meta.url), "utf8");
  const appMain = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
  assert.match(ux, /Mantieni il testo/);
  assert.match(ux, /Elimina link e testo associato/);
  assert.match(ux, /Anchor text che verrà eliminato/);
  assert.match(ux, /previewCards\.length !== 1/);
  assert.match(ux, /choiceKey/);
  assert.match(ux, /window\.confirm/);
  assert.match(appMain, /BrokenLinkCleanupChoiceUx/);
});
