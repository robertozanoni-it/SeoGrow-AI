import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_MODULES } from "./suite/productArchitecture.js";

test("Piano editoriale contract matches the actual evidence-first runtime", () => {
  const moduleDefinition = PRODUCT_MODULES.find((item) => item.page === "Piano editoriale");
  assert.equal(moduleDefinition.primaryCta, "Genera contenuto");
  assert.match(moduleDefinition.states.completed, /Piano strutturato dai dati SEO/);
  assert.ok(moduleDefinition.data.includes("opportunità"));
  assert.ok(moduleDefinition.data.includes("ranking"));
  assert.ok(moduleDefinition.owns.includes("editorial-planning"));
  assert.ok(moduleDefinition.owns.includes("content-briefs"));
});
