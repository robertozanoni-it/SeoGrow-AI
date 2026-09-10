import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { repairTaskClientIds } from "./taskClientIdIntegrity.js";

const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("gli ID cliente numerici salvati come stringa vengono riparati senza cambiare gli altri task", () => {
  const source = [
    { id: "a", sourceClientId: "12", title: "A", notes: "mantieni" },
    { id: "b", sourceClientId: 13, title: "B" },
    { id: "c", sourceClientId: "cliente", title: "C" },
  ];
  const result = repairTaskClientIds(source);
  assert.equal(result.changed, true);
  assert.equal(result.tasks[0].sourceClientId, 12);
  assert.equal(result.tasks[0].notes, "mantieni");
  assert.equal(result.tasks[1], source[1]);
  assert.equal(result.tasks[2], source[2]);
});

test("la migrazione è caricata prima dell'app", () => {
  assert.match(main, /import ['"]\.\/taskClientIdIntegrity['"]/);
  assert.ok(main.indexOf("./taskClientIdIntegrity") < main.indexOf("import App from './App'"));
});
