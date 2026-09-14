import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUnifiedProblems } from "./problemsModel.js";

const sourceUrl = "https://yogabuenaonda.it/?page_id=8196";
const rolledBackQa = {
  id: "qa-correction",
  clientId: 1,
  clientName: "Yoga Buena Onda",
  issueType: "qa-isolated",
  issueLabel: "Collaudo Elementor 8196",
  siteUrl: "https://yogabuenaonda.it/",
  sourceUrl,
  resource: "pages",
  entityId: 8196,
  status: "Ripristinato",
  appliedAt: "2026-09-09T00:29:00.000Z",
  rollbackAt: "2026-09-09T00:40:00.000Z",
};

test("qa-isolated ripristinato resta storico intenzionale e non problema SEO attivo", () => {
  const task = {
    id: "legacy-reopened-qa-task",
    sourceClientId: 1,
    client: "Yoga Buena Onda",
    kind: "qa-isolated",
    title: "Collaudo Elementor 8196",
    sourceUrl,
    priority: "Media",
    status: "Da fare",
    detail: "Task riaperta automaticamente dopo rollback della correzione.",
    createdAt: "2026-09-09T00:40:01.000Z",
  };
  const result = buildUnifiedProblems({ clientId: 1, tasks: [task], corrections: [rolledBackQa] });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].issueType, "qa-isolated");
  assert.equal(result.rows[0].interventionState, "rolled_back");
  assert.equal(result.rows[0].problemState, "intentional");
  assert.equal(result.rows[0].severity, "unknown");
  assert.equal(result.rows.filter((row) => !["resolved", "intentional"].includes(row.problemState)).length, 0);
  assert.equal(result.rows.filter((row) => row.severity === "high" && !["resolved", "intentional"].includes(row.problemState)).length, 0);
});

test("un rollback SEO normale continua a riaprire il problema", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    corrections: [{
      ...rolledBackQa,
      id: "normal-correction",
      issueType: "title",
      issueLabel: "Title da correggere",
      entityId: 99,
      sourceUrl: "https://yogabuenaonda.it/pagina/",
    }],
  });
  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.rows[0].interventionState, "rolled_back");
});

test("il rollback qa-isolated non riapre più task future", async () => {
  const source = await readFile(new URL("./remediationStore.js", import.meta.url), "utf8");
  assert.match(source, /issueType === "qa-isolated" && exactProblemStatus\(record\?\.status\) === "rolled_back"/);
});
