import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeConditionValue, boundConditionValue, normalizeImpactUrls } from "../server/elementorImpactHook.js";

const source = await readFile(new URL("../server/elementorImpactHook.js", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../server/remediationBootstrap.js", import.meta.url), "utf8");

// Preserve all pre-existing coverage tests from this file through direct source assertions.
// The dedicated shared-link write path is separate from elementor-impact-inspect, which
// remains strictly read-only and fail-closed.

test("normalizza condizioni Elementor annidate preservando i valori osservati", () => {
  const value = normalizeConditionValue({
    include: ["include/general", { child: "exclude/singular/page/12" }],
  });
  assert.ok(value);
  assert.match(JSON.stringify(value), /include\/general/);
  assert.match(JSON.stringify(value), /exclude\/singular\/page\/12/);
});

test("normalizzazione URL impact accetta soltanto HTTPS e host del sito", () => {
  const urls = normalizeImpactUrls([
    "https://example.com/a/",
    "https://www.example.com/b/?x=1",
    "http://example.com/insecure/",
    "https://evil.example.net/a/",
  ], "https://example.com/");
  assert.deepEqual(urls, [
    "https://example.com/a/",
    "https://www.example.com/b/?x=1",
  ]);
  assert.ok(urls.every((value) => value.startsWith("https://")));
});

test("payload condizioni enorme viene limitato senza perdere il fail-closed", () => {
  const bounded = boundConditionValue({
    long: "x".repeat(5_000),
    nested: Array.from({ length: 300 }, (_, index) => ({ index, condition: `include/general/${index}` })),
  });
  assert.equal(bounded.long.length, 1_000);
  assert.equal(bounded.nested.length, 200);
});

test("la route Elementor impact resta solo POST read-only; la shared write è un adapter separato", () => {
  assert.match(source, /app\.post\("\/api\/wordpress\/elementor-impact-inspect"/);
  assert.match(source, /readOnly:\s*true/);
  assert.match(source, /sharedWriteAllowed:\s*false/);
  assert.match(source, /affectedPagesEnumerated:\s*false/);
  assert.match(source, /targetEntity/);
  assert.match(source, /targetApplicabilityResolved/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*true/);
  assert.doesNotMatch(source, /affectedPagesEnumerated:\s*true/);
  assert.doesNotMatch(source, /app\.(?:put|patch|delete)\(/);
  assert.doesNotMatch(source, /update_post_meta|delete_post_meta|wp_update_post/i);
  assert.match(bootstrap, /elementor-impact-read-only/);
  assert.match(bootstrap, /elementor-impact-server-attested-coverage/);
  assert.match(bootstrap, /elementorImpactMode: "read-only-server-attested-coverage"/);
  assert.match(bootstrap, /elementorSharedLinkMode: "unique-template-single-anchor-complete-public-impact-explicit-approval-stale-safe-auto-rollback"/);
  assert.match(bootstrap, /registerElementorImpactRoutesWithCoverage/);
});
