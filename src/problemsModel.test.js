import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const issue = {
  type: "duplicate-title",
  severity: "alta",
  label: "Title duplicato",
  targetUrl: "https://example.it/pagina/",
  detail: "Condivide il title con un'altra pagina.",
};

test("una verifica più vecchia di un audit recente diventa ricomparso", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-05T10:00:00Z", pagesChecked: 10, issues: [issue] }],
    corrections: [{
      id: "c1",
      clientId: 1,
      issueType: "duplicate-title",
      issueLabel: "Title duplicato",
      sourceUrl: "https://example.it/pagina/",
      status: "Verificato",
      verifiedAt: "2026-09-05T09:00:00Z",
    }],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "reappeared");
});

test("task completata non trasforma il problema in risolto", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-05T10:00:00Z", issues: [issue] }],
    tasks: [{
      id: "analysis-1",
      sourceClientId: "1",
      kind: "duplicate-title",
      title: "Title duplicato",
      sourceUrl: "https://example.it/pagina/",
      status: "Completato",
      completedAt: "2026-09-05T10:10:00Z",
      priority: "Alta",
    }],
  });
  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.rows[0].interventionState, "task_completed");
});

test("le fonti operative usano la stessa cronologia degli eventi di stato", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "task-1",
      sourceClientId: 1,
      kind: "duplicate-title",
      title: "Title duplicato",
      sourceUrl: "https://example.it/pagina/",
      status: "Completato",
      updatedAt: "2026-09-05T09:00:00Z",
      completedAt: "2026-09-05T11:00:00Z",
    }],
    corrections: [{
      id: "correction-1",
      clientId: 1,
      issueType: "duplicate-title",
      issueLabel: "Title duplicato",
      sourceUrl: "https://example.it/pagina/",
      status: "Ripristinato",
      verifiedAt: "2026-09-05T08:00:00Z",
      appliedAt: "2026-09-05T07:30:00Z",
      rollbackAt: "2026-09-05T12:00:00Z",
      verificationNote: "Rollback eseguito.",
    }],
  });
  const row = result.rows[0];
  assert.equal(row.sources[0].kind, "correction");
  assert.equal(row.sources[0].at, "2026-09-05T12:00:00Z");
  assert.equal(row.sources[1].kind, "task");
  assert.equal(row.sources[1].at, "2026-09-05T11:00:00Z");
});

test("audit pagina successivo non elimina la copertura del crawl sito", () => {
  const pageIssue = { type: "h1", label: "0 H1 rilevati", severity: "alta", targetUrl: "https://example.it/seconda" };
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-05T09:00:00Z", pagesChecked: 25, issues: [issue] }],
    pageHistory: [{ analyzedAt: "2026-09-05T11:00:00Z", url: "https://example.it/seconda", issues: [pageIssue] }],
  });
  assert.equal(result.coverage.sitePages, 25);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.some((row) => row.auditScopes.includes("site")));
  assert.ok(result.rows.some((row) => row.auditScopes.includes("page")));
});

test("task legacy senza ID cliente non viene associata per nome", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{ id: "legacy", client: "Cliente", title: "Problema", kind: "audit", sourceUrl: "https://example.it", status: "Da fare" }],
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("più link rotti sulla stessa pagina restano separati e mantengono pagina sorgente e target", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt: "2026-09-05T10:00:00Z",
      issues: [
        { type: "broken-external-link", label: "Link esterno non raggiungibile (404)", sourceUrl: "https://example.it/pagina", targetUrl: "https://a.example/manca", severity: "alta", detail: "HTTP 404" },
        { type: "broken-external-link", label: "Link esterno non raggiungibile (404)", sourceUrl: "https://example.it/pagina", targetUrl: "https://b.example/manca", severity: "alta", detail: "HTTP 404" },
      ],
    }],
  });
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((row) => row.sourceUrl === "https://example.it/pagina"));
  assert.deepEqual(result.rows.flatMap((row) => row.targetUrls).toSorted(), ["https://a.example/manca", "https://b.example/manca"]);
  assert.ok(result.rows.every((row) => row.evidence.some((entry) => /Destinazione: https:\/\//.test(entry.detail))));
});

test("un audit più vecchio non sovrascrive gravità e dettaglio di quello più recente", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-05T12:00:00Z", issues: [{ type: "title", label: "Title critico", sourceUrl: "https://example.it/a/", severity: "alta", detail: "Dato recente" }] }],
    pageHistory: [{ analyzedAt: "2026-09-05T10:00:00Z", url: "https://example.it/a/", issues: [{ type: "title", label: "Title vecchio", sourceUrl: "https://example.it/a/", severity: "bassa", detail: "Dato vecchio" }] }],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].severity, "high");
  assert.equal(result.rows[0].title, "Title critico");
  assert.equal(result.rows[0].detail, "Dato recente");
});

test("le pagine GDPR non entrano nel centro problemi SEO", () => {
  const result = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{ analyzedAt: "2026-09-05T12:00:00Z", issues: [
      { type: "title", label: "Title privacy", sourceUrl: "https://example.it/privacy-policy/", severity: "alta" },
      { type: "title", label: "Title contenuto", sourceUrl: "https://example.it/corso/", severity: "media" },
    ] }],
  });
  assert.deepEqual(result.rows.map((row) => row.title), ["Title contenuto"]);
});

test('chiusura persistente prevale su audit storico e nuova evidenza successiva la rende ricomparsa', () => {
  const audit={analyzedAt:'2026-09-16T10:00:00Z',url:'https://example.com/a',issues:[{type:'noindex',label:'Pagina impostata noindex',url:'https://example.com/a'}]};
  const closure={clientId:1,issueType:'noindex',sourceUrl:'https://example.com/a',closedAt:'2026-09-16T11:00:00Z'};
  const closed=buildUnifiedProblems({clientId:1,pageHistory:[audit],closures:[closure],now:Date.parse('2026-09-16T12:00:00Z')});
  assert.equal(closed.rows[0].problemState,'resolved');
  const newer={...audit,analyzedAt:'2026-09-16T13:00:00Z'};
  const reappeared=buildUnifiedProblems({clientId:1,pageHistory:[newer],closures:[closure],now:Date.parse('2026-09-16T14:00:00Z')});
  assert.equal(reappeared.rows[0].problemState,'reappeared');
});


test('una chiusura legacy senza target non chiude tutti i broken link della stessa pagina', () => {
  const audit={analyzedAt:'2026-09-16T10:00:00Z',issues:[
    {type:'broken-external-link',label:'Link esterno non raggiungibile (404)',sourceUrl:'https://example.com/pagina',targetUrl:'https://a.example/manca'},
    {type:'broken-external-link',label:'Link esterno non raggiungibile (404)',sourceUrl:'https://example.com/pagina',targetUrl:'https://b.example/manca'},
  ]};
  const closure={clientId:1,issueType:'broken-external-link',sourceUrl:'https://example.com/pagina',closedAt:'2026-09-16T11:00:00Z'};
  const result=buildUnifiedProblems({clientId:1,siteHistory:[audit],closures:[closure],now:Date.parse('2026-09-16T12:00:00Z')});
  assert.equal(result.rows.length,2);
  assert.ok(result.rows.every(row=>row.problemState==='open'));
});


test("una task generata da un vecchio audit non mantiene aperto il problema dopo un audit pagina più recente pulito", () => {
  const url = "https://example.it/pagina/";
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "audit-task-old",
      sourceClientId: 1,
      kind: "title",
      title: "Title duplicato",
      sourceUrl: url,
      status: "Da fare",
      origin: "audit",
      automatic: true,
      lastObservedAt: "2026-09-05T10:00:00Z",
      updatedAt: "2026-09-05T10:05:00Z",
    }],
    pageHistory: [{
      analyzedAt: "2026-09-19T08:00:00Z",
      url,
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T09:00:00Z"),
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "resolved");
  assert.equal(result.rows[0].resolvedByAudit, true);
  assert.equal(result.activeRows.length, 0);
  assert.equal(result.rows[0].observedAt, "2026-09-19T08:00:00Z");
  assert.equal(result.rows[0].stale, false);
});

test("una task manuale non viene chiusa soltanto perché un audit successivo non contiene il finding", () => {
  const url = "https://example.it/pagina/";
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "manual-task",
      sourceClientId: 1,
      kind: "title",
      title: "Controllo title manuale",
      sourceUrl: url,
      status: "Da fare",
      origin: "manual",
      automatic: false,
      updatedAt: "2026-09-05T10:05:00Z",
    }],
    pageHistory: [{
      analyzedAt: "2026-09-19T08:00:00Z",
      url,
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T09:00:00Z"),
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.activeRows.length, 1);
});


test("una task audit legacy senza origin viene chiusa da un nuovo audit sito completo che non trova più il duplicate-title", () => {
  const url = "https://example.it/pagina/";
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "legacy-dup-title",
      sourceClientId: 1,
      kind: "duplicate-title",
      title: "Title duplicato",
      sourceUrl: url,
      status: "Da fare",
      updatedAt: "2026-09-05T10:05:00Z",
    }],
    siteHistory: [{
      analyzedAt: "2026-09-19T08:00:00Z",
      pages: [{ url, ok: true }],
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T09:00:00Z"),
  });

  assert.equal(result.rows[0].problemState, "resolved");
  assert.equal(result.rows[0].resolvedByAudit, true);
  assert.equal(result.activeRows.length, 0);
});

test("un audit di singola pagina non basta a chiudere un duplicate-title perché l'unicità richiede il crawl sito", () => {
  const url = "https://example.it/pagina/";
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "legacy-dup-title",
      sourceClientId: 1,
      kind: "duplicate-title",
      title: "Title duplicato",
      sourceUrl: url,
      status: "Da fare",
      updatedAt: "2026-09-05T10:05:00Z",
    }],
    pageHistory: [{
      analyzedAt: "2026-09-19T08:00:00Z",
      url,
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T09:00:00Z"),
  });

  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.activeRows.length, 1);
});

test("una task esplicitamente manuale resta aperta anche se usa un kind tecnico legacy", () => {
  const url = "https://example.it/pagina/";
  const result = buildUnifiedProblems({
    clientId: 1,
    tasks: [{
      id: "manual-dup-title",
      sourceClientId: 1,
      kind: "duplicate-title",
      title: "Controllo duplicato manuale",
      sourceUrl: url,
      status: "Da fare",
      origin: "manual",
      automatic: false,
      updatedAt: "2026-09-05T10:05:00Z",
    }],
    siteHistory: [{
      analyzedAt: "2026-09-19T08:00:00Z",
      pages: [{ url, ok: true }],
      issues: [],
      reviewItems: [],
    }],
    now: Date.parse("2026-09-19T09:00:00Z"),
  });

  assert.equal(result.rows[0].problemState, "open");
  assert.equal(result.activeRows.length, 1);
});
