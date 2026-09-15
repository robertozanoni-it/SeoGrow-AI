import test from "node:test";
import assert from "node:assert/strict";
import { appendGeoHistory, geoEntityProfile, geoPageScores, geoQueryMonitor, geoStrategies } from "./geoIntelligence.js";

test("page GEO score and answerability are evidence based", () => {
  const rows = geoPageScores({ pagesAudited:["https://x/a"], signals:{pageWordCounts:[{url:"https://x/a",words:800}],pageExternalSources:[{url:"https://x/a",count:2}],hasAuthor:true,hasUpdatedDate:true}, issues:[] });
  assert.equal(rows[0].score, 100); assert.equal(rows[0].answerability, 100);
});

test("entity profile is explicit and query monitor preserves change history", () => {
  const entity = geoEntityProfile({ schemaTypes:["Organization"], signals:{hasAbout:true,hasContact:true,hasAuthor:false,hasUpdatedDate:true} });
  assert.equal(entity.entityType, "Organization"); assert.equal(entity.score, 80);
  const monitor = geoQueryMonitor({ questions:["q"], simulation:{results:[{question:"q",coverage:"Coperta"}]}, history:[{simulation:{results:[{question:"q",coverage:"Parziale"}]}}] });
  assert.equal(monitor[0].changed, true);
});

test("GEO strategy joins audit simulation and observed SERP gaps", () => {
  const rows = geoStrategies({ audit:{issues:[{id:"a",title:"A",recommendation:"Fix",severity:"Alta"}]}, simulation:{results:[{question:"Q",coverage:"Scoperta",gap:"Gap"}]}, observation:{queries:[{query:"K",ownedPresence:false,competitors:["c.it"]}]} });
  assert.deepEqual(rows.map(x=>x.source), ["Audit GEO","Simulazione OpenAI","DataForSEO SERP"]);
});

test("GEO history is bounded newest first", () => {
  const rows = appendGeoHistory([{capturedAt:"old"}], {capturedAt:"new"}, 1); assert.deepEqual(rows.map(x=>x.capturedAt), ["new"]);
});
