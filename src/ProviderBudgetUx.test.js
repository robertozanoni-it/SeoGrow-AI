import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./ProviderBudgetUx.js", import.meta.url), "utf8");

test("la card AI distingue OpenAI, OpenRouter e OmniRoute", () => {
  assert.match(source, /openai:\s*\{/);
  assert.match(source, /openrouter:\s*\{/);
  assert.match(source, /omniroute:\s*\{/);
  assert.match(source, /Budget AI \/ OmniRoute/);
  assert.match(source, /localhost:20128/);
  assert.match(source, /Modello richiesto/);
});

test("la card AI usa il provider dichiarato dal runtime remediation", () => {
  assert.match(source, /\/api\/wordpress\/remediation-capabilities/);
  assert.match(source, /capabilities\?\.aiProvider/);
  assert.match(source, /\["openai", "openrouter", "omniroute"\]/);
});
