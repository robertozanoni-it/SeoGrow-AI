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

test("suite report includes rankings, editorial plan and executive overview", () => {
  const html = buildClientReport({
    client: { name: "Client", url: "https://example.com" }, tasks: [],
    rankings: { items: [{ keyword: "seo locale", position: 4, delta: 2, url: "https://example.com/seo" }] },
    editorial: [{ id: "e1", title: "Guida SEO", type: "article", date: "2026-09-20", url: "https://example.com/guida" }],
  });
  assert.ok(html.includes("<h2>Sintesi executive</h2>"));
  assert.ok(html.includes("<h2>Posizionamenti</h2>"));
  assert.ok(html.includes("seo locale"));
  assert.ok(html.includes("<h2>Piano editoriale</h2>"));
  assert.ok(html.includes("Guida SEO"));
});

test("suite report can omit new sections independently", () => {
  const html = buildClientReport({ client: { name: "Client", url: "https://example.com" }, tasks: [], template: { sections: { overview: false, rankings: false, editorial: false } } });
  assert.ok(!html.includes("<h2>Sintesi executive</h2>"));
  assert.ok(!html.includes("<h2>Posizionamenti</h2>"));
  assert.ok(!html.includes("<h2>Piano editoriale</h2>"));
});
