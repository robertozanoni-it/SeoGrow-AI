import test from "node:test";
import assert from "node:assert/strict";
import { buildSeoOpportunities, validateSeoOpportunityActionability } from "./modules/rank/index.js";

const problem = {
  key: "p-thin",
  title: "Contenuto breve",
  issueType: "thin",
  sourceUrl: "https://example.com/guida/",
  detail: "Pagina con contenuto insufficiente.",
  severity: "high",
  problemState: "open",
  correctability: "automatic",
  confidence: "confirmed",
};
const ranking = {
  keyword: "yoga bergamo",
  url: "https://example.com/yoga/",
  position: 9,
  delta: -3,
  checkedAt: "2026-09-17T12:00:00Z",
};
const content = {
  id: "update-yoga-bergamo",
  type: "Aggiornamento",
  title: "yoga bergamo",
  reason: "120 impressioni · posizione 9.0 · CTR 1.20%",
  url: "https://example.com/yoga/",
  association: "Confermata da dati query–pagina",
  objective: "Consolidare la prima pagina",
  format: "Pagina esistente",
  priority: "Alta",
};
const link = {
  key: "https://example.com/a/|https://example.com/b/",
  sourceUrl: "https://example.com/a/",
  targetUrl: "https://example.com/b/",
  anchor: "guida yoga",
  reason: "Titoli e percorsi condividono i temi: guida, yoga.",
};

test("raccoglie audit, ranking, contenuti e link e deduplica ranking/contenuto", () => {
  const result = buildSeoOpportunities({
    auditProblems: [problem],
    rankingRows: [ranking],
    contentItems: [content],
    linkSuggestions: [link],
    gscDataset: { queries: [{ dimension: "yoga bergamo", impressions: 120, page: ranking.url }] },
  });
  assert.equal(result.candidates, 4);
  assert.equal(result.opportunities.length, 3);
  assert.equal(result.rejected.length, 0);
  const merged = result.opportunities.find((item) => item.dedupeKey === "query|yoga-bergamo");
  assert.ok(merged);
  assert.deepEqual(new Set(merged.sourceTypes), new Set(["ranking", "content"]));
  assert.equal(merged.action.kind, "content");
  assert.equal(merged.impact, "Alto");
});

test("un problema audit correggibile mantiene CTA Correzioni", () => {
  const { opportunities } = buildSeoOpportunities({ auditProblems: [problem] });
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].action.kind, "correction");
  assert.equal(opportunities[0].action.page, "Correzioni");
  assert.equal(opportunities[0].action.problemKey, problem.key);
});

test("un problema non correggibile resta azionabile come Task", () => {
  const manual = { ...problem, key: "p-review", title: "Verifica manuale", issueType: "custom", correctability: "not_supported", confidence: "needs_confirmation" };
  const { opportunities } = buildSeoOpportunities({ auditProblems: [manual] });
  assert.equal(opportunities[0].action.kind, "task");
  assert.equal(opportunities[0].action.page, "Task");
  assert.equal(opportunities[0].effort, "Alto");
});

test("ranking senza URL produce un Task invece di fingere una pagina contenuto", () => {
  const row = { ...ranking, url: "", position: 14, delta: null };
  const { opportunities } = buildSeoOpportunities({ rankingRows: [row] });
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].action.kind, "task");
  assert.match(opportunities[0].action.task.detail, /URL non associata/i);
});

test("il Gate garantisce che ogni opportunità restituita sia azionabile", () => {
  const { opportunities } = buildSeoOpportunities({
    auditProblems: [problem],
    rankingRows: [ranking],
    contentItems: [content],
    linkSuggestions: [link],
  });
  assert.ok(opportunities.length > 0);
  for (const item of opportunities) assert.equal(validateSeoOpportunityActionability(item).ok, true, item.title);
});

test("opportunità risolte o intenzionali non rientrano dall'Audit", () => {
  const resolved = { ...problem, problemState: "resolved" };
  const intentional = { ...problem, key: "intentional", problemState: "intentional" };
  const result = buildSeoOpportunities({ auditProblems: [resolved, intentional] });
  assert.equal(result.opportunities.length, 0);
});

test("un link interno resta una correzione instradata al modulo Link interni", () => {
  const { opportunities } = buildSeoOpportunities({ linkSuggestions: [link] });
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].action.kind, "correction");
  assert.equal(opportunities[0].action.page, "Link interni");
  assert.equal(opportunities[0].action.linkKey, link.key);
});
