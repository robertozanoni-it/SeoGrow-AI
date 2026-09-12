import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guard = await readFile(new URL("./ProjectSelectionGuard.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./ProjectSelectionGuard.css", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("un progetto assente o non più esistente non usa il primo cliente come fallback visibile", () => {
  assert.match(guard, /normalizeClientId\(readJson\(SELECTED_CLIENT_KEY, null\)\)/);
  assert.match(guard, /clients\.some/);
  assert.match(guard, /selectedExists/);
  assert.match(guard, /Seleziona il progetto prima di continuare/);
  assert.match(guard, /navigatePage\("Clienti"\)/);
  assert.match(css, /data-seogrow-project-selection-blocked="true"/);
  assert.match(css, /\.workspace > main/);
});

test("Clienti e Impostazioni restano accessibili per recuperare il contesto", () => {
  assert.match(guard, /SAFE_WITHOUT_PROJECT = new Set\(\["Clienti", "Impostazioni"\]\)/);
});

test("la guardia è montata globalmente", () => {
  assert.match(main, /import ProjectSelectionGuard from ['"]\.\/ProjectSelectionGuard['"]/);
  assert.match(main, /<ProjectSelectionGuard \/>/);
});
