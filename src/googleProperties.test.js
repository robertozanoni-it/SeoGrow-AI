import test from "node:test";
import assert from "node:assert/strict";
import { mergeGoogleStatus, normalizeGoogleProperties } from "./googleProperties.js";
test("a late Google status response preserves already loaded properties", () => {
  const properties = Array.from({ length: 19 }, (_, i) => ({ url: `https://site-${i}.example/` }));
  const merged = mergeGoogleStatus({ configured: true, connected: true, properties }, { configured: false, connected: false, redirectUri: "http://localhost:8787/api/google/callback" });
  assert.deepEqual(merged.properties, properties); assert.equal(merged.connected, true); assert.equal(merged.configured, true); assert.ok(merged.redirectUri);
});
test("malformed and duplicate Google properties are handled explicitly", () => {
  assert.throws(() => normalizeGoogleProperties(null));
  assert.deepEqual(normalizeGoogleProperties([null, {}, { url: " " }, { url: "https://a.example" }, { url: "https://a.example" }]), [{ url: "https://a.example" }]);
  assert.equal(mergeGoogleStatus({}, { configured: false, connected: false }).connected, false);
});
