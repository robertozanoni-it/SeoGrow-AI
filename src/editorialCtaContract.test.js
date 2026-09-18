import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_MODULES } from "./suite/productArchitecture.js";
import { readFile } from "node:fs/promises";

test("Piano editoriale contract matches the actual evidence-first runtime", async () => {
  const moduleDefinition = PRODUCT_MODULES.find((item) => item.page === "Piano editoriale");
  assert.equal(moduleDefinition.primaryCta, "Genera contenuto");
  assert.match(moduleDefinition.states.completed, /Piano strutturato dai dati SEO/);
  const workspace = await readFile(new URL("./EditorialPlanWorkspaceLayer.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(workspace, /buildEditorialPlanRows/);
  assert.match(workspace, /validateEditorialProjectContext/);
  assert.match(app, />Genera contenuto</);
  assert.doesNotMatch(workspace, />Genera piano editoriale</);
});
