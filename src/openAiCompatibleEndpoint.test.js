import test from "node:test";
import assert from "node:assert/strict";
import {
  openAiCompatibleBaseUrl,
  openAiCompatibleModel,
  openAiCompatibleProvider,
  rewriteOpenAiApiUrl,
  rewriteOpenAiCompatibleRequestBody,
} from "../server/openAiCompatibleEndpoint.js";

test("OpenAI resta l'unico provider AI autorizzato", () => {
  assert.equal(openAiCompatibleBaseUrl({}), "https://api.openai.com/v1");
  assert.equal(openAiCompatibleBaseUrl({ OPENAI_BASE_URL: "https://api.openai.com/v1" }), "https://api.openai.com/v1");
  assert.equal(openAiCompatibleProvider({}), "openai");
  assert.equal(openAiCompatibleModel("gpt-5-mini", {}), "gpt-5-mini");
  assert.equal(
    rewriteOpenAiApiUrl("https://api.openai.com/v1/responses", {}),
    "https://api.openai.com/v1/responses",
  );
  const body = JSON.stringify({ model: "gpt-5-mini", input: "x" });
  assert.equal(rewriteOpenAiCompatibleRequestBody(body, {}), body);
});

test("provider AI alternativi e proxy locali vengono rifiutati fail-closed", () => {
  for (const base of [
    "https://openrouter.ai/api/v1",
    "http://localhost:20128/v1",
    "http://127.0.0.1:20128/v1",
    "https://evil.example/v1",
    "https://api.openai.com/altro",
  ]) {
    assert.throws(
      () => openAiCompatibleBaseUrl({ OPENAI_BASE_URL: base }),
      /non è autorizzato|deve usare HTTPS/,
    );
  }
});

test("il boundary provider viene applicato anche ai helper compatibili", () => {
  const env = { OPENAI_BASE_URL: "https://openrouter.ai/api/v1" };
  assert.throws(() => openAiCompatibleProvider(env), /non è autorizzato/);
  assert.throws(() => openAiCompatibleModel("gpt-5-mini", env), /non è autorizzato/);
  assert.throws(
    () => rewriteOpenAiApiUrl("https://api.openai.com/v1/responses", env),
    /non è autorizzato/,
  );
  assert.throws(
    () => rewriteOpenAiCompatibleRequestBody(JSON.stringify({ model: "gpt-5-mini" }), env),
    /non è autorizzato/,
  );
});

test("URL non OpenAI non vengono riscritti quando il provider è valido", () => {
  assert.equal(
    rewriteOpenAiApiUrl("https://example.com/api", {}),
    "https://example.com/api",
  );
});
