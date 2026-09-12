import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { brokenExternalTarget, prepareElementorBrokenExternalLink, removeExactAnchor } from "./brokenLinkRemediation.js";
import { remediationIssueKind } from "./remediationIssueKind.js";
import { issueCorrectability } from "./reliabilityModel.js";

const target = "https://www.fioredellavita.it/yoga/yoga-alimentazione/";

test("broken-external-link usa l'adapter assistito dedicato", () => {
  const issue = { type: "broken-external-link", label: "Link esterno non raggiungibile (404)", targetUrl: target };
  assert.equal(remediationIssueKind(issue), "external_link");
  assert.equal(issueCorrectability(issue), "assisted");
  assert.equal(brokenExternalTarget(issue), target);
});

test("rimuove un solo anchor 404 preservando testo e markup interno", () => {
  const source = `<p>Testo</p><p><a class="x" href="${target}" rel="nofollow"><strong>Evitare i cibi tamasici</strong></a>: descrizione.</p>`;
  const result = removeExactAnchor(source, target);
  assert.equal(result.count, 1);
  assert.equal(result.anchors[0], "Evitare i cibi tamasici");
  assert.doesNotMatch(result.value, /fioredellavita\.it/);
  assert.match(result.value, /<strong>Evitare i cibi tamasici<\/strong>: descrizione/);
});

test("trasforma _elementor_data solo quando il target è univoco", () => {
  const raw = JSON.stringify([{ id: "a", elType: "widget", widgetType: "text-editor", settings: { editor: `<ul><li><a href="${target}"><strong>Evitare i cibi tamasici</strong></a></li></ul>` }, elements: [] }]);
  const result = prepareElementorBrokenExternalLink(raw, target);
  assert.equal(result.state, "valid");
  assert.equal(result.count, 1);
  assert.equal(result.anchors[0], "Evitare i cibi tamasici");
  assert.doesNotMatch(result.serialized, /fioredellavita\.it/);
  const parsed = JSON.parse(result.serialized);
  assert.match(parsed[0].settings.editor, /<strong>Evitare i cibi tamasici<\/strong>/);
});

test("più occorrenze restano rilevabili come ambigue", () => {
  const raw = JSON.stringify([{ settings: { editor: `<a href="${target}">Uno</a><a href="${target}">Due</a>` }, elements: [] }]);
  const result = prepareElementorBrokenExternalLink(raw, target);
  assert.equal(result.state, "valid");
  assert.equal(result.count, 2);
});

test("il controllo live usa il piano external_link senza OpenAI o Rank Math", async () => {
  const source = await readFile(new URL("./WordPressLiveRemediationControlV2.jsx", import.meta.url), "utf8");
  assert.match(source, /kind === "external_link"/);
  assert.match(source, /prepareElementorBrokenExternalLink/);
  assert.match(source, /Elementor link cleanup/);
  assert.match(source, /unlink-preserve-text/);
});
