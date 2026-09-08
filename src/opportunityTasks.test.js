import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { opportunityTask, findExistingTask } from "./opportunityTasks.js";
import { opportunityGroups } from "./platform.js";

const row = { dimension: "yoga cinisello balsamo", position: 18.15, impressions: 289 };
test("opportunity task uses query-page evidence as its source, never destination", () => {
  for (const key of ["query", "dimension"]) {
    const values = opportunityTask(row, { queryPages: [{ [key]: row.dimension, pages: ["https://example.com/yoga/"] }] });
    assert.equal(values.sourceUrl, "https://example.com/yoga/");
    assert.equal(values.targetUrl, "");
    assert.equal(values.associationStatus, "verified");
    assert.equal(values.kind, "search");
    assert.equal(values.query, row.dimension);
  }
});
test("missing evidence stays suggested, even with API data", () => {
  const values = opportunityTask(row, { queryPages: [], pages: [] });
  assert.equal(values.sourceUrl, "");
  assert.equal(values.associationStatus, "suggested");
});
test("existing query task is reused without overwriting user edits", () => {
  const values = opportunityTask(row, {});
  const existing = { id: "gsc-1-yoga", sourceClientId: 1, kind: "search", query: row.dimension.toUpperCase(), title: "Titolo personalizzato", sourceUrl: "https://example.com/verified", notes: "Conservare", status: "In corso" };
  assert.equal(findExistingTask([existing], values, 1), existing);
  assert.equal(findExistingTask([existing], values, 2), undefined);
  assert.equal(findExistingTask([{ ...existing, status: "Completato" }], values, 1), undefined);
  assert.equal(findExistingTask([{ ...existing, stale: true }], values, 1), undefined);
  assert.equal(findExistingTask([existing], opportunityTask(row, {}, "cannibalizations"), 1), undefined);
  assert.equal(existing.notes, "Conservare");
});
test("recognizes legacy destination tasks but not unrelated link tasks", () => {
  const values = opportunityTask({ ...row, page: "https://example.com/yoga/" }, {});
  const old = { sourceClientId: 1, kind: "manual", title: values.title, targetUrl: values.sourceUrl };
  assert.equal(findExistingTask([old], values, 1), old);
  assert.equal(findExistingTask([{ ...old, sourceUrl: "https://example.com/other" }], values, 1), undefined);
});
test("dashboard and opportunities share impression threshold and result cap", () => {
  const queries = Array.from({ length: 64 }, (_, i) => ({ ...row, dimension: String(i), impressions: i < 6 ? 10 : 9 }));
  assert.equal(opportunityGroups({ queries }).quickWins.length, 6);
  assert.equal(opportunityGroups({ queries: queries.map(q => ({ ...q, impressions: 10 })) }).quickWins.length, 50);
  const guided = readFileSync(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
  assert.match(guided, /const opportunities = opportunityGroups\(dataset\).quickWins.length/);
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(app, /onCreateTask\(taskValues\)/);
  assert.match(app, /findExistingTask\(tasks, values, selectedClient\)/);
});
