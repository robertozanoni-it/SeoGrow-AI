import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalRuntimePage } from "./PageRouteReconciler.js";
import { canonicalPageForLegacyView } from "./suite/productArchitecture.js";

const [app, center, overview, browser, hubManifest] = await Promise.all([
  "App.jsx",
  "ProjectCenter.jsx",
  "OverviewDashboard.jsx",
  "../scripts/browser-smoke.mjs",
  "experience/hub/manifest.js",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")));

test("Storico e SeoGrow AI restano alias compatibili ma non superfici React dedicate", () => {
  assert.equal(canonicalPageForLegacyView("Storico"), "Centro progetto");
  assert.equal(canonicalPageForLegacyView("SeoGrow AI"), "SEO Agent");
  assert.equal(canonicalRuntimePage("Storico"), "Centro progetto");
  assert.equal(canonicalRuntimePage("SeoGrow AI"), "SEO Agent");

  assert.doesNotMatch(app, /function HistoryPage/);
  assert.doesNotMatch(app, /page === ["']Storico["']/);
  assert.doesNotMatch(app, /SeoGrowAiDashboard/);
  assert.doesNotMatch(app, /page === ["']SeoGrow AI["']/);
  assert.doesNotMatch(overview, /export function SeoGrowAiDashboard/);
});

test("Centro progetto possiede lo storico senza round-trip verso la route ritirata", () => {
  assert.match(center, /id: "history"/);
  assert.match(center, /Storico del progetto/);
  assert.match(center, /buildProjectHistory/);
  assert.match(center, /corrections = \[\]/);
  assert.match(app, /corrections=\{correctionHistory\}/);
  assert.doesNotMatch(center, /onNavigate\(["']Storico["']\)/);
});

test("visual QA copre i moduli canonici e non tratta le viste ritirate come peer", () => {
  assert.doesNotMatch(browser, /\["SeoGrow AI", "seogrow-ai"/);
  assert.doesNotMatch(browser, /\["Storico", "storico"/);
  assert.match(browser, /\["SEO Agent", "seo-agent"/);
  assert.match(browser, /\["Centro progetto", "centro-progetto"/);
});

test("il registry può conservare i nomi legacy solo come compatibilità di lettura", () => {
  assert.match(hubManifest, /pages: \["Panoramica", "Clienti", "Centro progetto", "Storico", "SeoGrow AI"\]/);
});
