import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

import { brokenExternalTarget, prepareElementorBrokenExternalLink, removeExactAnchor, resetBrokenLinkCleanupModesForTests, setBrokenLinkCleanupMode } from "./brokenLinkRemediation.js";

beforeEach(() => resetBrokenLinkCleanupModesForTests());
afterEach(() => resetBrokenLinkCleanupModesForTests());

const target = "https://www.yogajournal.com/poses/types/advanced/";
const wrapped = `https://www.google.com/search?q=${target}`;
const anchor = "Yoga Journal fornisce approfondimenti dettagliati sulle tecniche per affrontare queste posizioni complesse";
const beforeText = `<p>Una guida qualificada come\u00a0<a href="${wrapped}">${anchor}</a>, sottolineando sempre l'importanza di una progressione graduale.</p>`;
const fixture = (html = beforeText) => [
  { id: "heading", elType: "widget", widgetType: "heading", settings: { title: "Titolo invariato" }, elements: [] },
  { id: "cd1d669", elType: "widget", widgetType: "text-editor", settings: { editor: html, text_color: "#123456" }, elements: [] },
];

for (const [mode, replacement] of [["unlink-preserve-text", anchor], ["delete-anchor-text", ""]]) {
  test(`real Google-wrapped link is removed locally: ${mode}`, () => {
    const data = fixture();
    const raw = JSON.stringify(data);
    const result = prepareElementorBrokenExternalLink(raw, target, mode);
    assert.equal(result.state, "valid");
    assert.equal(result.count, 1, "the link belongs to the local document, not a shared template");
    assert.equal(result.action, mode);
    assert.deepEqual(result.anchors, [anchor]);
    const expected = fixture(beforeText.replace(`<a href="${wrapped}">${anchor}</a>`, replacement));
    assert.deepEqual(JSON.parse(result.serialized), expected, "only the exact anchor changes");
    assert.equal(JSON.stringify(data), raw, "the input snapshot remains available for rollback");
  });
}

test("Yoga Alliance wrapper with authuser and HTML entities supports both cleanup choices", () => {
  const destination = "https://www.yogaalliance.org/credentialing/credentials-for-teachers";
  const label = "standard della Yoga Alliance per l'insegnamento avanzato";
  const link = `<a class="ng-star-inserted" href="https://www.google.com/search?q=${destination}&amp;authuser=1" target="_blank" rel="noopener">${label}</a>`;
  for (const mode of ["unlink-preserve-text", "delete-anchor-text"]) {
    const result = removeExactAnchor(`<p>Secondo gli ${link}.</p>`, destination, mode);
    assert.equal(result.count, 1);
    assert.deepEqual(result.anchors, [label]);
    assert.equal(result.value, `<p>Secondo gli ${mode === "delete-anchor-text" ? "" : label}.</p>`);
  }
});

test("wrapped destructive choice is consumed once, never inherited by another page", { concurrency: false }, () => {
  setBrokenLinkCleanupMode(target, "delete-anchor-text");
  const first = prepareElementorBrokenExternalLink(fixture(), target);
  const second = prepareElementorBrokenExternalLink(fixture(), target);
  assert.equal(first.action, "delete-anchor-text");
  assert.doesNotMatch(first.serialized, /Yoga Journal/);
  assert.equal(second.action, "unlink-preserve-text");
  assert.match(second.serialized, /Yoga Journal/);
});

test("malformed Elementor JSON stays blocked", () => {
  assert.equal(prepareElementorBrokenExternalLink("not-json", target).state, "invalid");
  assert.equal(prepareElementorBrokenExternalLink('{}', target).state, "invalid");
});

test("anchor markup and whitespace are preserved while the readable label is normalized", () => {
  const html = `<p>Prima <a title="a > b" href='${wrapped}'><strong>Yoga</strong>\n &amp;\t respiro</a> dopo.</p>`;
  const result = transformBrokenLinkAnchors(html, target);
  assert.equal(result.value, "<p>Prima <strong>Yoga</strong>\n &amp;\t respiro dopo.</p>");
  assert.deepEqual(result.anchors, ["Yoga & respiro"]);
  assert.equal(result.matches[0].storedHref, wrapped);
});

// Exercise the actual app planner on every supported app platform. A missing
// source file is a failure, not a reason to skip a release assertion.
test("actual WordPress plan chooses the local Elementor adapter for both modes", { concurrency: false }, async () => {
  const source = (await readFile(new URL("./WordPressLiveRemediationControlV2.jsx", import.meta.url), "utf8") + "\n" + await readFile(new URL("./wordpressRemediationEngine.js", import.meta.url), "utf8"));
  const match = source.match(/async function buildPlan\([\s\S]*?(?=\n(?:const |function |async function |export ))/);
  assert.ok(match, "actual buildPlan source found");
  const buildPlan = runInNewContext(`${match[0]}\nbuildPlan`, {
    pluginMeta: (entity) => entity.meta || {},
    remediationContextDecision: () => ({ allowed: true }),
    brokenExternalTarget,
    prepareElementorBrokenExternalLink,
    removeExactAnchor,
    ownershipUndetermined: (_kind, message) => new Error(message),
  });
  for (const mode of ["unlink-preserve-text", "delete-anchor-text"]) {
    setBrokenLinkCleanupMode(target, mode);
    const plan = await buildPlan("external_link", { type: "broken-external-link", targetUrl: target },
      { entity: { id: 6260, meta: { _elementor_data: JSON.stringify(fixture()) } } }, "https://yogabuenaonda.it/yoga-avanzati-cinisello-balsamo/", {});
    assert.equal(plan.adapter, "Elementor link cleanup");
    const actual = JSON.parse(plan.changes.meta._elementor_data);
    const expected = JSON.parse(prepareElementorBrokenExternalLink(fixture(), target, mode).serialized);
    assert.deepEqual(actual, expected);
  }
});

// The WordPress/PHP contract runs on the Linux server CI job. macOS tests the
// Node app and launcher; its runner does not provide a PHP interpreter. Require
// PHP on Linux instead of silently skipping when the server runtime is missing.
if (process.platform === "linux") {
  test("Linux PHP: both local payloads pass existing Connector apply and rollback validators", () => {
    assert.equal(spawnSync("php", ["-v"]).status, 0, "Linux server QA requires PHP");
    const dir = new URL("../wordpress-plugin/seogrow-connector/", import.meta.url);
    const code = `define('ABSPATH', __DIR__); function add_filter() {} function wp_parse_url($v){return parse_url($v);} function home_url($v){return 'https://yogabuenaonda.it/';}
      class WP_REST_Request { private $p; function __construct($p){$this->p=$p;} function get_param($k){return $this->p[$k]??null;} }
      require ${JSON.stringify(new URL("elementor-link-cleanup-write.php", dir).pathname)};
      require ${JSON.stringify(new URL("elementor-single-text-write.php", dir).pathname)};
      $p=json_decode(stream_get_contents(STDIN),true);$r=new WP_REST_Request($p);
      $link=seogrow_elementor_link_cleanup_validate($r);$text=seogrow_elementor_single_text_validate($r);
      echo json_encode(array('link'=>$link!==false,'text'=>$text!==false));`;
    for (const mode of ["unlink-preserve-text", "delete-anchor-text"]) {
      const before = JSON.stringify(fixture());
      const after = prepareElementorBrokenExternalLink(before, target, mode).serialized;
      for (const operation of ["apply", "rollback"]) {
        const payload = { operation, resource: "posts", id: 6260,
          expectedCurrent: { meta: { _elementor_data: operation === "apply" ? before : after } },
          changes: { meta: { _elementor_data: operation === "apply" ? after : before } } };
        const result = spawnSync("php", ["-r", code], { input: JSON.stringify(payload), encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        const checks = JSON.parse(result.stdout);
        assert.equal(checks.link || checks.text, true, `${mode} ${operation} must pass a narrow local validation path`);
        if (mode === "unlink-preserve-text") assert.equal(checks.link, true);
      }
    }
  });
}
