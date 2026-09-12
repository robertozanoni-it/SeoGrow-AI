import test from "node:test";
import assert from "node:assert/strict";
import { collectSeoOutputText, parseSeoStructuredValue } from "../server/wordpressSeoAdapterV2Hook.js";

test("collects OpenAI Responses output_text", () => {
  assert.equal(collectSeoOutputText({ output_text: '{"value":"Yoga per Dimagrire a Cinisello Balsamo"}' }), '{"value":"Yoga per Dimagrire a Cinisello Balsamo"}');
});

test("collects OpenAI-compatible chat completion content returned by OmniRoute", () => {
  assert.equal(
    collectSeoOutputText({ choices: [{ message: { role: "assistant", content: '{"value":"Yoga per Dimagrire a Cinisello Balsamo"}' } }] }),
    '{"value":"Yoga per Dimagrire a Cinisello Balsamo"}',
  );
});

test("collects array chat content returned by compatible gateways", () => {
  assert.equal(
    collectSeoOutputText({ choices: [{ message: { content: [{ type: "text", text: '{"value":"Titolo SEO"}' }] } }] }),
    '{"value":"Titolo SEO"}',
  );
});

test("parses strict JSON, fenced JSON and compatible plain text", () => {
  assert.equal(parseSeoStructuredValue('{"value":"Titolo SEO"}'), "Titolo SEO");
  assert.equal(parseSeoStructuredValue('```json\n{"value":"Titolo SEO"}\n```'), "Titolo SEO");
  assert.equal(parseSeoStructuredValue('Yoga per Dimagrire a Cinisello Balsamo'), "Yoga per Dimagrire a Cinisello Balsamo");
  assert.equal(parseSeoStructuredValue('"Yoga per Dimagrire a Cinisello Balsamo"'), "Yoga per Dimagrire a Cinisello Balsamo");
});

test("plain compatible output still rejects empty or JSON-looking malformed payloads", () => {
  assert.throws(() => parseSeoStructuredValue(""), /valore SEO richiesto/);
  assert.throws(() => parseSeoStructuredValue('{value:"rotto"}'), /strutturato valido/);
});
