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

test('Centro progetto possiede lo storico unificato con identificatori stabili', () => {
  const center = readFileSync(new URL('./ProjectCenter.jsx', import.meta.url), 'utf8');
  assert.match(center, /buildProjectHistory\(\{[\s\S]*audits: analysisHistory[\s\S]*tasks: projectTasks[\s\S]*corrections/);
  assert.match(center, /filteredProjectHistory\.map\(\(item\) =>/);
  assert.match(center, /key=\{item\.id\}/);
  assert.doesNotMatch(center, /onNavigate\(["']Storico["']\)/);
});

test('index dichiara un favicon servito dall app', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.svg"/);
});
