import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sidebar groups use visibly distinct alternating backgrounds', async () => {
  const css = await readFile(new URL('./GuidedUxLayer.css', import.meta.url), 'utf8');
  assert.match(css, /tone-blue \{ background: #edf5ff;/);
  assert.match(css, /tone-mint \{ background: #edf8f2;/);
});

test('batch primary action excludes selected problems without a safe batch adapter', async () => {
  const source = await readFile(new URL('./BatchRemediationPanel.jsx', import.meta.url), 'utf8');
  assert.match(source, /selectedAutomatic = selected\.filter/);
  assert.match(source, /choose\(selectedAutomatic\)/);
  assert.match(source, /richiedono verifica o intervento singolo/);
});
