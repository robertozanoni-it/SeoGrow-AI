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
  assert.match(css, /\.page-title \.primary[\s\S]*font-size: 14px !important/);
  assert.match(css, /\.corrections-filter \.primary[\s\S]*font-size: 14px !important/);
  assert.match(css, /\.opportunity-table \.table-scroll[\s\S]*overflow-x: visible !important/);
  assert.match(css, /\.opportunity-table thead[\s\S]*display: none/);
});

test('HistoryPage usa una chiave univoca anche con timestamp duplicati o mancanti', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.match(app, /history\.map\(\(item, index\) =>/);
  assert.match(app, /key=\{`\$\{item\.analyzedAt \|\| ["']missing["']\}-\$\{index\}`\}/);
});

test('index dichiara un favicon servito dall app', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.svg"/);
});
