import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [overview, guided, app, center, css, architecture] = await Promise.all([
  "OverviewDashboard.jsx",
  "GuidedUxLayer.jsx",
  "App.jsx",
  "ProjectCenter.jsx",
  "ReferenceLayout.css",
  "suite/productArchitecture.js",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")));

test("Panoramica owns one canonical next-action surface", () => {
  assert.match(overview, /Cosa devo fare adesso\?/);
  assert.match(overview, /intelligence\.nextAction/);
  assert.match(overview, /operationalSignals\.map/);
  assert.doesNotMatch(overview, /priorityActions\.map|Next Best Action/);
  assert.match(architecture, /completed: "Mostra stato aggiornato, priorità e una sola prossima azione consigliata\."/);
});

test("the four operational signals are visible but do not create four competing primary CTAs", () => {
  for (const label of ["Problemi", "Opportunità", "Posizionamenti", "Task"]) assert.match(overview, new RegExp(label));
  assert.match(overview, /reference-priority-primary/);
  assert.match(overview, /reference-priority-signals/);
  assert.match(css, /\.reference-priority-signals/);
});

test("Guided UX no longer mounts a second Panoramica priority engine", () => {
  assert.doesNotMatch(guided, /function NextActions|pageHosts\.dashboard|guided-next-actions-title|Cosa fare adesso/);
});

test("Panoramica and Centro progetto receive the same project ranking history", () => {
  assert.match(app, /<Dashboard[\s\S]*rankings=\{rankings\[selectedClient\] \|\| rankings\[String\(selectedClient\)\] \|\| \[\]\}/);
  assert.match(app, /<ProjectCenter[\s\S]*rankings=\{rankings\[selectedClient\] \|\| rankings\[String\(selectedClient\)\] \|\| \[\]\}/);
  assert.match(center, /buildProjectIntelligence\(\{[\s\S]*rankings/);
});
