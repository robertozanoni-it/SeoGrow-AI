import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hydrateLocalProviderEnv } from "../server/providerEnv.js";

const withTemp = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seogrow-provider-env-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

test("la configurazione OpenAI della preview resta locale se presente", (t) => {
  const root = withTemp(t);
  const preview = path.join(root, "SeoGrow-AI-preview");
  const main = path.join(root, "SeoGrow-AI");
  fs.mkdirSync(preview); fs.mkdirSync(main);
  fs.writeFileSync(path.join(preview, ".env"), "OPENAI_API_KEY=preview-key\nOPENAI_MODEL=preview-model\n");
  fs.writeFileSync(path.join(main, ".env"), "OPENAI_API_KEY=main-key\nOPENAI_MODEL=main-model\n");
  const env = {};
  const result = hydrateLocalProviderEnv({ cwd: preview, home: root, env, sharedEnv: "" });
  assert.equal(result.configured, true);
  assert.equal(result.imported, false);
  assert.equal(env.OPENAI_API_KEY, "preview-key");
  assert.equal(env.OPENAI_MODEL, "preview-model");
});

test("una clone -preview riutilizza OpenAI dalla installazione principale solo in memoria", (t) => {
  const root = withTemp(t);
  const preview = path.join(root, "SeoGrow-AI-preview");
  const main = path.join(root, "SeoGrow-AI");
  fs.mkdirSync(preview); fs.mkdirSync(main);
  fs.writeFileSync(path.join(main, ".env"), "OPENAI_API_KEY=main-key\nOPENAI_MODEL=gpt-test\nOPENAI_MONTHLY_BUDGET_USD=9\n");
  const env = {};
  const result = hydrateLocalProviderEnv({ cwd: preview, home: root, env, sharedEnv: "" });
  assert.equal(result.configured, true);
  assert.equal(result.imported, true);
  assert.equal(env.OPENAI_API_KEY, "main-key");
  assert.equal(env.OPENAI_MODEL, "gpt-test");
  assert.equal(env.OPENAI_MONTHLY_BUDGET_USD, "9");
  assert.equal(fs.existsSync(path.join(preview, ".env")), false, "la chiave non viene copiata nella preview");
});

test("senza sorgente OpenAI non inventa alcuna configurazione", (t) => {
  const root = withTemp(t);
  const preview = path.join(root, "SeoGrow-AI-preview");
  fs.mkdirSync(preview);
  const env = {};
  const result = hydrateLocalProviderEnv({ cwd: preview, home: root, env, sharedEnv: "" });
  assert.equal(result.configured, false);
  assert.equal(env.OPENAI_API_KEY, undefined);
});
