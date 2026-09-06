import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../scripts/wordpress-taxonomy-e2e.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");

test("taxonomy E2E interrompe subito la verifica se il valore backend non coincide più", () => {
  assert.match(script, /if \(last\.storedMatch === false\)/);
  assert.match(script, /Valore backend mutato durante la riverifica/);
  assert.match(script, /Interruzione immediata: nessun rollback automatico/);
});

test("recovery esegue rollback solo se il valore corrente è ancora il marker SeoGrow", () => {
  assert.match(script, /async function safeRecovery/);
  assert.match(script, /if \(sameValue\(current, original\)\)/);
  assert.match(script, /if \(!sameValue\(current, marker\)\)/);
  assert.match(script, /Nessun rollback automatico eseguito per non sovrascrivere una modifica concorrente/);
  assert.match(script, /await rollback\(target, adapter, original, marker\)/);
});

test("taxonomy E2E registra originale, marker e valore corrente per diagnosi", () => {
  assert.match(script, /Piano E2E · originale=/);
  assert.match(script, /Apply confermato · before=/);
  assert.match(script, /Stato recovery · originale=/);
  assert.match(script, /INTERVENTO MANUALE RICHIESTO/);
});

test("workflow usa action runtime Node 24 compatibile anche per gli artifact", () => {
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /actions\/upload-artifact@v5/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
});
