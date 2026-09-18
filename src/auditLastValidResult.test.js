import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

test("Audit SEO preserves the last valid result when a refresh fails", () => {
  const auditStart = app.indexOf("function AuditPage(");
  const auditEnd = app.indexOf("\nfunction AuditResults", auditStart);
  const audit = app.slice(auditStart, auditEnd);
  assert.match(audit, /response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(audit, /if \(!response\.ok\) throw new Error/);
  assert.match(audit, /if \(!data \|\| typeof data !== "object"\) throw new Error/);
  assert.ok(audit.indexOf("setAuditResult(data)") < audit.indexOf("} catch (err)"));
  assert.doesNotMatch(audit.slice(audit.indexOf("} catch (err)")), /setAuditResult\(/);
  assert.match(audit, /L’ultimo audit valido resta disponibile qui sotto/);
  assert.match(audit, /role="alert"/);
});
