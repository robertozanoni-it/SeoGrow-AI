import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectOutcomes } from "./projectOutcomes.js";

test("project outcomes remain scoped and label observed deltas without causal claims", () => {
  const result = buildProjectOutcomes({ client:{id:1,name:"A"}, tasks:[{sourceClientId:1,status:"Completato",workflowResult:"WordPress draft"},{sourceClientId:2,status:"Completato"}], dataset:{totals:{clicks:120}}, previousDataset:{totals:{clicks:100}}, problemSummary:{resolved:3,verifiedCorrections:2}, geo:{audit:{score:81}} });
  assert.equal(result.completedTasks,1); assert.equal(result.wordpressResults,1); assert.equal(result.resolvedProblems,3); assert.equal(result.verifiedCorrections,2); assert.equal(result.clickDeltaPct,20); assert.equal(result.geoScore,81); assert.match(result.note,/non implicano causalità/);
});
