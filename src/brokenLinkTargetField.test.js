import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ui = await readFile(new URL("./uiIntegrityFixes.js", import.meta.url), "utf8");
const css = await readFile(new URL("./WordPressLiveRemediationControlV2.css", import.meta.url), "utf8");
const connector = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/release-gate.yml", import.meta.url), "utf8");

test("il link esterno 404 è mostrato in un campo dedicato con Apri e Copia", () => {
  assert.match(ui, /Link da correggere/);
  assert.match(ui, /input\.readOnly = true/);
  assert.match(ui, /Apri link/);
  assert.match(ui, /Copia link/);
  assert.match(ui, /Link esatto da correggere:/);
  assert.match(css, /\.seogrow-broken-link-target-field/);
  assert.match(css, /\.seogrow-broken-link-target-row/);
});

test("il pacchetto Connector aggiornato è distinguibile come 1.3.6", () => {
  assert.match(connector, /Version:\s*1\.3\.6/);
  assert.match(connector, /elementor-link-cleanup-write\.php/);
  assert.match(workflow, /seogrow-connector-1\.3\.6/);
  assert.match(workflow, /artifacts\/seogrow-connector-1\.3\.6\.zip/);
});
