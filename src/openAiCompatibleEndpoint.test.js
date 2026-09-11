import test from "node:test";
import assert from "node:assert/strict";
import {
  openAiCompatibleBaseUrl,
  openAiCompatibleProvider,
  rewriteOpenAiApiUrl,
} from "../server/openAiCompatibleEndpoint.js";

test("OpenAI resta il provider predefinito", () => {
  assert.equal(openAiCompatibleBaseUrl({}), "https://api.openai.com/v1");
  assert.equal(openAiCompatibleProvider({}), "openai");
  assert.equal(
    rewriteOpenAiApiUrl("https://api.openai.com/v1/responses", {}),
    "https://api.openai.com/v1/responses",
  );
});

test("OpenRouter sostituisce solo la base API OpenAI mantenendo il path", () => {
  const env = { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" };
  assert.equal(openAiCompatibleProvider(env), "openrouter");
  assert.equal(
    rewriteOpenAiApiUrl("https://api.openai.com/v1/responses", env),
    "https://openrouter.ai/api/v1/responses",
  );
  assert.equal(
    rewriteOpenAiApiUrl("https://api.openai.com/v1/models?limit=2", env),
    "https://openrouter.ai/api/v1/models?limit=2",
  );
});

test("la chiave non può essere instradata verso host arbitrari", () => {
  assert.throws(
    () => openAiCompatibleBaseUrl({ OPENAI_BASE_URL: "https://evil.example/v1" }),
    /non è autorizzato/,
  );
  assert.throws(
    () => openAiCompatibleBaseUrl({ OPENAI_BASE_URL: "http://openrouter.ai/api/v1" }),
    /HTTPS/,
  );
  assert.throws(
    () => openAiCompatibleBaseUrl({ OPENAI_BASE_URL: "https://openrouter.ai/altro" }),
    /deve essere esattamente/,
  );
});

test("URL non OpenAI non vengono riscritti", () => {
  const env = { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" };
  assert.equal(
    rewriteOpenAiApiUrl("https://example.com/api", env),
    "https://example.com/api",
  );
});
