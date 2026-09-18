import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectIntelligence } from "./projectIntelligence.js";

test("missing evidence is prioritized before growth work", () => {
  const model = buildProjectIntelligence({ client:{id:1,name:"A"}, tasks:[], opportunityCount:8 });
  assert.equal(model.nextAction.id,"audit");
  assert.ok(model.actions.some(item => item.id === "gsc"));
  assert.ok(model.actions.some(item => item.id === "opportunities"));
});

test("critical findings and pending verification outrank ordinary tasks", () => {
  const model = buildProjectIntelligence({ client:{id:1,name:"A"}, dataset:{queries:[]}, analysis:{issues:[{severity:"high"}]}, problemSummary:{verify:2}, wordpressConnected:true, tasks:[{id:"t",sourceClientId:1,status:"Da fare",priority:"Alta"}] });
  assert.equal(model.nextAction.id,"critical");
  assert.ok(model.actions.findIndex(item => item.id === "verify") < model.actions.findIndex(item => item.id === "tasks"));
});

test("tasks stay isolated to the selected project", () => {
  const model = buildProjectIntelligence({ client:{id:1,name:"A"}, dataset:{queries:[]}, analysis:{issues:[]}, wordpressConnected:true, tasks:[{sourceClientId:2,status:"Da fare",priority:"Alta"}] });
  assert.equal(model.facts.openTasks,0);
  assert.equal(model.facts.highTasks,0);
});

test("stale evidence becomes a refresh action before ordinary growth work", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const model = buildProjectIntelligence({ client:{id:1,name:"A"}, dataset:{importedAt:"2026-08-20T12:00:00Z",queries:[]}, analysis:{analyzedAt:"2026-07-01T12:00:00Z",issues:[]}, wordpressConnected:true, opportunityCount:3, now });
  assert.equal(model.nextAction.id,"audit-refresh");
  assert.ok(model.actions.some(item => item.id === "gsc-refresh"));
  assert.equal(model.facts.auditAgeDays,76);
  assert.equal(model.facts.gscAgeDays,26);
});


test("GEO readiness enters the shared next-best-action queue", () => {
  const model = buildProjectIntelligence({ client:{id:1,name:"A"}, dataset:{importedAt:"2026-09-15",queries:[]}, analysis:{analyzedAt:"2026-09-15",issues:[]}, wordpressConnected:true, geo:{audit:{score:58,issues:[{severity:"Alta"}]}} });
  assert.ok(model.actions.some((item) => item.page === "GEO AI" && item.reason === "geo_readiness"));
});


test("material DataForSEO declines enter the canonical queue before ordinary opportunities", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const rankings = [
    { checkedAt:"2026-09-18T08:00:00Z", device:"desktop", depth:20, locationCode:2826, languageCode:"it", rankings:[{keyword:"seo bergamo",position:15,url:"https://example.com/seo"}] },
    { checkedAt:"2026-09-10T08:00:00Z", device:"desktop", depth:20, locationCode:2826, languageCode:"it", rankings:[{keyword:"seo bergamo",position:8,url:"https://example.com/seo"}] },
  ];
  const model = buildProjectIntelligence({
    client:{id:1,name:"A"},
    dataset:{importedAt:"2026-09-18T08:00:00Z",queries:[{dimension:"seo bergamo",position:15,impressions:120,clicks:5,ctr:4}]},
    analysis:{analyzedAt:"2026-09-18T07:00:00Z",issues:[]},
    problemSummary:{active:0,high:0,verify:0},
    wordpressConnected:true,
    rankings,
    now,
  });
  assert.equal(model.nextAction.id,"rankings-decline");
  assert.equal(model.facts.materialRankingDeclines,1);
  assert.equal(model.facts.severeRankingDeclines,1);
  assert.ok(model.actions.findIndex(item => item.id === "rankings-decline") < model.actions.findIndex(item => item.id === "opportunities"));
});

test("overdue project tasks outrank non-urgent growth work", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const model = buildProjectIntelligence({
    client:{id:1,name:"A"},
    dataset:{importedAt:"2026-09-18T08:00:00Z",queries:[]},
    analysis:{analyzedAt:"2026-09-18T07:00:00Z",issues:[]},
    problemSummary:{active:0,high:0,verify:0},
    wordpressConnected:true,
    rankings:[{checkedAt:"2026-09-18T08:00:00Z",device:"desktop",depth:20,locationCode:2826,languageCode:"it",rankings:[]}],
    tasks:[{id:"late",sourceClientId:1,status:"Da fare",priority:"Media",due:"2026-09-17"}],
    now,
  });
  assert.equal(model.nextAction.id,"tasks-overdue");
  assert.equal(model.facts.overdueTasks,1);
});

test("operational signals expose exactly Problems, Opportunities, Rankings and Tasks", () => {
  const model = buildProjectIntelligence({
    client:{id:1,name:"A"},
    dataset:{importedAt:"2026-09-18",queries:[]},
    analysis:{analyzedAt:"2026-09-18",issues:[]},
    problemSummary:{active:0,high:0,verify:0},
    wordpressConnected:true,
    rankings:[{checkedAt:"2026-09-18",device:"desktop",depth:20,locationCode:2826,languageCode:"it",rankings:[]}],
  });
  assert.deepEqual(model.operationalSignals.map(item => item.label), ["Problemi","Opportunità","Posizionamenti","Task"]);
  assert.deepEqual(model.operationalSignals.map(item => item.page), ["Problemi","Opportunità","Posizionamenti","Task"]);
});
