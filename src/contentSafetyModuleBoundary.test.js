import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentSafetyErrors } from "./modules/content/index.js";
import { contentSafetyErrors as legacyContentSafetyErrors } from "./modules/content/index.js";
import {
  decodeLinkEntities,
  singleAnchorHref,
} from "./modules/links/index.js";
import {
  decodeLinkEntities as legacyDecodeLinkEntities,
  singleAnchorHref as legacySingleAnchorHref,
} from "./modules/links/index.js";

test("Content facade preserves editorial safety behavior and legacy compatibility", () => {
  assert.equal(contentSafetyErrors, legacyContentSafetyErrors);
  assert.deepEqual(contentSafetyErrors("<p>Test</p>"), []);
  assert.ok(contentSafetyErrors("<script>alert(1)</script>").length > 0);
  assert.ok(contentSafetyErrors("<h1>Nuovo</h1>", "<p>Prima</p>").some((item) => item.includes("H1")));
});

test("Content uses the public Links facade for shared link parsing", () => {
  assert.equal(decodeLinkEntities, legacyDecodeLinkEntities);
  assert.equal(singleAnchorHref, legacySingleAnchorHref);
});

test("editorial safety business logic belongs to Content and legacy file is only a shim", async () => {
  const implementation = await readFile(new URL("./modules/content/contentSafety.js", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("./editorialContentSafety.js", import.meta.url), "utf8"), (error) => error?.code === "ENOENT");

  assert.match(implementation, /export function contentSafetyErrors/);
  assert.match(implementation, /from ["']\.\.\/links\/index\.js["']/);
  assert.doesNotMatch(implementation, /brokenLinkHref\.js/);
});
