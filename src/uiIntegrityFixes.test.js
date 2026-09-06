import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeDateLabel } from './uiIntegrityFixes.js';

test('safeDateLabel non espone Invalid Date', () => {
  assert.equal(safeDateLabel(undefined), 'Data non disponibile');
  assert.equal(safeDateLabel('not-a-date'), 'Data non disponibile');
  assert.notEqual(safeDateLabel('2026-09-06T13:00:00Z'), 'Data non disponibile');
});

test('responsive hardening copre breakpoint tablet e mobile', () => {
  const css = readFileSync(new URL('./responsiveIntegrity.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.sidebar\.open/);
  assert.match(css, /\.tabs[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.tasks-panel tr/);
  assert.match(css, /\.content-layout/);
});
