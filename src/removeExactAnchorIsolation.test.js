import test from "node:test";
import assert from "node:assert/strict";
import { removeExactAnchor } from "./brokenLinkRemediation.js";

test("removeExactAnchor Yoga Alliance entity wrapper is deterministic for both explicit modes", () => {
  const destination = "https://www.yogaalliance.org/credentialing/credentials-for-teachers";
  const label = "standard della Yoga Alliance per l'insegnamento avanzato";
  const link = `<a class="ng-star-inserted" href="https://www.google.com/search?q=${destination}&amp;authuser=1" target="_blank" rel="noopener">${label}</a>`;
  const html = `<p>Secondo gli ${link}.</p>`;

  const preserve = removeExactAnchor(html, destination, "unlink-preserve-text");
  assert.equal(preserve.count, 1);
  assert.deepEqual(preserve.anchors, [label]);
  assert.equal(preserve.value, `<p>Secondo gli ${label}.</p>`);

  const remove = removeExactAnchor(html, destination, "delete-anchor-text");
  assert.equal(remove.count, 1);
  assert.deepEqual(remove.anchors, [label]);
  assert.equal(remove.value, "<p>Secondo gli .</p>");
});

test("removeExactAnchor explicit delete mode does not depend on previous calls", () => {
  const destination = "https://example.com/a";
  const html = `<p><a href="${destination}">A</a></p>`;
  for (let index = 0; index < 20; index += 1) {
    const result = removeExactAnchor(html, destination, "delete-anchor-text");
    assert.equal(result.count, 1);
    assert.equal(result.value, "<p></p>");
    assert.equal(result.action, "delete-anchor-text");
  }
});
