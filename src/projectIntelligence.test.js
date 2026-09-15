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
