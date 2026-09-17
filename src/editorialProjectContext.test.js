import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEditorialProjectContext,
  validateEditorialProjectContext,
  serializeEditorialProjectContext,
  parseEditorialProjectContext,
} from "./modules/content/index.js";

const client = { id: 7, name: "Progetto QA", url: "https://example.com/" };

test("editorial generation is blocked without a selected project", () => {
  const context = buildEditorialProjectContext({ dataset: { queries: [{ dimension: "seo locale", impressions: 30 }] } });
  const gate = validateEditorialProjectContext(context);
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((item) => item.includes("ID progetto")));
  assert.ok(gate.errors.some((item) => item.includes("Nome progetto")));
});

test("project identity alone is not enough to generate editorial content", () => {
  const context = buildEditorialProjectContext({ client });
  const gate = validateEditorialProjectContext(context);
  assert.equal(gate.ok, false);
  assert.ok(gate.errors.some((item) => item.includes("evidenza SEO")));
});

test("Search Console evidence makes the project context valid", () => {
  const context = buildEditorialProjectContext({
    client,
    dataset: {
      queries: [{ dimension: "seo locale bergamo", clicks: 2, impressions: 120, ctr: 1.6, position: 12.2 }],
      pages: [{ dimension: "https://example.com/seo-locale/" }],
    },
  });
  const gate = validateEditorialProjectContext(context);
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.evidenceSources, ["search-console"]);
  const serialized = serializeEditorialProjectContext(context);
  assert.equal(parseEditorialProjectContext(serialized).project.id, 7);
});

test("audit, ranking, Topical Map and workflow task are accepted project evidence", () => {
  const inputs = [
    { analysis: { analyzedAt: "2026-09-17T12:00:00Z", issues: [{ type: "thin", label: "Contenuto breve", url: "https://example.com/a/" }] } },
    { rankings: { rankings: [{ keyword: "dentista bergamo", position: 8, url: "https://example.com/dentista/" }] } },
    { topicalMap: { ideas: [{ keyword: "implantologia bergamo", coreKeyword: "implantologia", intent: "commerciale", searchVolume: 90 }] } },
    { workflowContext: { taskId: "task-1", title: "Aggiorna pagina servizi", sourceUrl: "https://example.com/servizi/" } },
  ];
  for (const input of inputs) {
    const gate = validateEditorialProjectContext(buildEditorialProjectContext({ client, ...input }));
    assert.equal(gate.ok, true);
    assert.equal(gate.evidenceSources.length, 1);
  }
});

test("context serialization fails closed", () => {
  assert.throws(
    () => serializeEditorialProjectContext(buildEditorialProjectContext({ client })),
    (error) => error?.code === "PROJECT_CONTEXT_REQUIRED",
  );
});
