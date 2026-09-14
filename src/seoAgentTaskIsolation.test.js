import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUnifiedProblems } from "./problemsModel.js";

const pageUrl = "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo/";

const agentTask = {
  id: "manual-agent-1",
  sourceClientId: 1,
  client: "Yoga",
  kind: "seo-agent",
  title: "Riesegui l’audit della singola URL e confronta URL analizzato, URL finale e canonical dichiarata.",
  targetUrl: pageUrl.replace(/\/$/, ""),
  sourceUrl: "",
  priority: "Media",
  status: "Da fare",
  createdAt: "2026-09-14T11:17:00.000Z",
};

test("una task SEO Agent non crea un problema autonomo", () => {
  const model = buildUnifiedProblems({ clientId: 1, tasks: [agentTask] });
  assert.equal(model.rows.length, 0);
});

test("una task SEO Agent non riapre un finding canonical gia chiuso da un audit piu recente", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt: "2026-09-14T10:19:54.000Z",
      url: "https://yogabuenaonda.it/",
      issues: [],
      reviewItems: [{
        type: "canonical-different",
        label: "Canonical differente dall’URL analizzato",
        sourceUrl: pageUrl,
        severity: "low",
      }],
      pages: [{ url: pageUrl, ok: true }],
    }],
    pageHistory: [{
      analyzedAt: "2026-09-14T11:03:06.000Z",
      url: pageUrl,
      issues: [],
      reviewItems: [],
    }],
    tasks: [agentTask],
  });
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].issueType, "canonical-different");
  assert.equal(model.rows[0].problemState, "resolved");
  assert.equal(model.rows.some((row) => row.issueType === "seo-agent"), false);
});

test("le task operative non SEO Agent continuano a entrare nel modello problemi", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    tasks: [{ ...agentTask, id: "manual-normal", kind: "manual", title: "Controlla H1", sourceUrl: pageUrl, targetUrl: "" }],
  });
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].problemState, "open");
});

test("le nuove task create dal SEO Agent usano titolo sintetico e URL come pagina", async () => {
  const source = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
  assert.match(source, /workflow === "PROBLEM_DIAGNOSIS" \? \(item\.query \|\| "Verifica finding SEO"\)/);
  assert.match(source, /sourceUrl: item\.page \|\| ""/);
  assert.match(source, /targetUrl: ""/);
  assert.match(source, /linkLabel: "Apri pagina"/);
});
