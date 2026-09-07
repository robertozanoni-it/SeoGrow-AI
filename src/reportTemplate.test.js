import test from "node:test";
import assert from "node:assert/strict";
import { buildClientReport } from "./seoHelpers.js";
test("personalized reports omit unselected sections and escape branding", () => {
  const html = buildClientReport({ client: { name: "Client", url: "https://example.com" }, tasks: [], template: { title: "Audit <script>bad</script>", brand: "<img src=x>", color: "#112233", sections: { queries: false, geo: false } } });
  assert.ok(html.includes("#112233"));
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.ok(!html.includes("<script>bad"));
  assert.ok(!html.includes("<h2>Top query Search Console</h2>"));
  assert.ok(!html.includes("<h2>Preparazione GEO</h2>"));
  assert.ok(html.includes("<h2>Task del progetto</h2>"));
});
