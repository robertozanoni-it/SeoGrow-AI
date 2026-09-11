import test from "node:test";
import assert from "node:assert/strict";
import {
  openAiCompatibleBaseUrl,
  openAiCompatibleModel,
  openAiCompatibleProvider,
  rewriteOpenAiApiUrl,
  rewriteOpenAiCompatibleRequestBody,
} from "../server/openAiCompatibleEndpoint.js";

test("OpenAI resta il provider predefinito", () => {
  assert.equal(openAiCompatibleBaseUrl({}), "https://api.openai.com/v1");
  assert.equal(openAiCompatibleProvider({}), "openai");
  assert.equal(openAiCompatibleModel("gpt-5-mini", {}), "gpt-5-mini");
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

test("OpenRouter aggiunge il namespace openai solo ai modelli senza provider", () => {
  const env = { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" };
  assert.equal(openAiCompatibleModel("gpt-5-mini", env), "openai/gpt-5-mini");
  assert.equal(openAiCompatibleModel("openai/gpt-5.4", env), "openai/gpt-5.4");
  assert.equal(openAiCompatibleModel("anthropic/claude-sonnet-4", env), "anthropic/claude-sonnet-4");
  assert.equal(
    JSON.parse(rewriteOpenAiCompatibleRequestBody(JSON.stringify({ model: "gpt-5-mini", input: "x" }), env)).model,
    "openai/gpt-5-mini",
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
