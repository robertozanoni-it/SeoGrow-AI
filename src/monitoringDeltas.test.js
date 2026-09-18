import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildGrowthMonitoring,
  buildGscMonitoring,
  buildRankingMonitoring,
} from "./modules/rank/index.js";
import { buildNotifications } from "./experience/hub/index.js";
import { createTaskDraft } from "./experience/tasks/index.js";
import { findExistingTask } from "./modules/rank/index.js";

const previousGsc = {
  property: { host: "example.com" },
  dateFrom: "2026-01-01",
  dateTo: "2026-01-28",
  importedAt: "2026-01-29T08:00:00Z",
  totals: { clicks: 100, impressions: 1000, ctr: 10, position: 8 },
  queries: [
    { dimension: "query persa", clicks: 5, impressions: 100, ctr: 5, position: 8, page: "https://example.com/a/" },
    { dimension: "query in calo", clicks: 10, impressions: 120, ctr: 8.3, position: 5, page: "https://example.com/b/" },
  ],
};

const currentGsc = {
  property: { host: "example.com" },
  dateFrom: "2026-02-01",
  dateTo: "2026-02-28",
  importedAt: "2026-03-01T08:00:00Z",
  totals: { clicks: 70, impressions: 900, ctr: 7.8, position: 10 },
  queries: [
    { dimension: "query in calo", clicks: 6, impressions: 110, ctr: 5.4, position: 10, page: "https://example.com/b/" },
  ],
};

const rankings = [
  {
    checkedAt: "2026-09-18T08:00:00Z",
    device: "desktop",
    depth: 20,
    locationCode: 2826,
    languageCode: "it",
    rankings: [{ keyword: "seo bergamo", position: 15, url: "https://example.com/seo/" }],
  },
  {
    checkedAt: "2026-09-10T08:00:00Z",
    device: "desktop",
    depth: 20,
    locationCode: 2826,
    languageCode: "it",
    rankings: [{ keyword: "seo bergamo", position: 8, url: "https://example.com/seo/" }],
  },
];

test("baseline senza periodo comparabile non inventa alert", () => {
  const gsc = buildGscMonitoring({ dataset: currentGsc });
  const rank = buildRankingMonitoring({ rankings: rankings.slice(0, 1) });
  assert.equal(gsc.baseline, true);
  assert.equal(rank.baseline, true);
  assert.deepEqual(gsc.alerts, []);
  assert.deepEqual(rank.alerts, []);
});

test("GSC produce delta solo da periodi compatibili e con evidenza materiale", () => {
  const result = buildGscMonitoring({ dataset: currentGsc, previousDataset: previousGsc });
  assert.equal(result.baseline, false);
  assert.equal(result.comparison.clicks, -30);
  assert.ok(result.alerts.some((item) => item.evidence.kind === "gsc-total-clicks" && item.taskDraft));
  assert.ok(result.alerts.some((item) => item.evidence.kind === "gsc-lost-queries" && item.taskDraft?.query === "query persa"));
  assert.ok(result.alerts.some((item) => item.evidence.kind === "gsc-position-drop" && item.taskDraft?.query === "query in calo"));
  assert.ok(result.alerts.every((item) => item.page === "Opportunità"));
});

test("DataForSEO confronta soltanto run omogenei e segnala cali materiali", () => {
  const result = buildRankingMonitoring({ rankings });
  assert.equal(result.baseline, false);
  assert.equal(result.rows[0].delta, -7);
  const alert = result.alerts.find((item) => item.evidence.kind === "dataforseo-ranking-decline");
  assert.ok(alert);
  assert.equal(alert.page, "Posizionamenti");
  assert.equal(alert.taskDraft.kind, "monitoring-ranking");
  assert.equal(alert.taskDraft.priority, "Alta");
});

test("identità alert è stabile per lo stesso pair di baseline/delta", () => {
  const one = buildGrowthMonitoring({ dataset: currentGsc, previousDataset: previousGsc, rankings });
  const two = buildGrowthMonitoring({ dataset: currentGsc, previousDataset: previousGsc, rankings });
  assert.deepEqual(one.alerts.map((item) => item.id), two.alerts.map((item) => item.id));
  assert.equal(new Set(one.alerts.map((item) => item.id)).size, one.alerts.length);
});

test("notification hub include monitoring e lascia la creazione task a una CTA esplicita", () => {
  const notifications = buildNotifications({
    tasks: [],
    dataset: currentGsc,
    previousDataset: previousGsc,
    rankings,
    analysis: null,
    now: Date.parse("2026-09-18T09:00:00Z"),
  });
  const monitor = notifications.find((item) => item.taskDraft);
  assert.ok(monitor);
  assert.ok(["Opportunità", "Posizionamenti"].includes(monitor.page));
  assert.equal(typeof monitor.taskDraft.title, "string");

  const client = { id: 7, name: "Demo" };
  const task = createTaskDraft(monitor.taskDraft, {
    client,
    clientId: 7,
    now: () => new Date("2026-09-18T09:00:00Z"),
    idFactory: () => "monitor-task-1",
  });
  assert.equal(findExistingTask([task], monitor.taskDraft, 7), task);
});

test("App non crea più task GSC durante l'import e usa alert→CTA controllata", async () => {
  const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /const generatedTasks = opportunityQueries\(data, 20\)/);
  assert.match(app, /GSC imports update the canonical dataset\/history only/);
  assert.match(app, /onNotificationTask=\{\(item\) =>/);
  assert.match(app, /className="notification-task"/);
  assert.match(app, />Crea task<\/button>/);
  assert.match(app, /rankings:\s*rankings\[selectedClient\]/);
});
