import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectHistory } from "./projectHistory.js";
test("project history merges and sorts audit correction and completed task events", () => {
  const rows=buildProjectHistory({ audits:[{analyzedAt:"2026-09-10T10:00:00Z",score:80,pagesChecked:5,issues:[]}], corrections:[{id:"c",verifiedAt:"2026-09-12T10:00:00Z",issueLabel:"Canonical",status:"Verificato"}], tasks:[{id:"t",status:"Completato",completedAt:"2026-09-15T10:00:00Z",title:"Articolo",workflowResult:"WordPress draft 9"}] });
  assert.deepEqual(rows.map(x=>x.type),["Contenuto","Correzione","Audit"]);
});
test("project history excludes open tasks and undated noise",()=>{ assert.deepEqual(buildProjectHistory({tasks:[{id:"a",status:"Da fare"},{id:"b",status:"Completato"}]}),[]); });

test("project history preserves exportable resource and result fields", () => {
  const [row] = buildProjectHistory({ tasks:[{id:"t",status:"Completato",completedAt:"2026-09-15T10:00:00Z",title:"Draft",completionReason:"Bozza creata",workflowResult:"WordPress draft 7",workflowUrl:"https://example.com/edit"}] });
  assert.equal(row.detail,"Bozza creata");
  assert.equal(row.url,"https://example.com/edit");
});
