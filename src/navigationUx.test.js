import test from "node:test";
import assert from "node:assert/strict";
import { searchWorkspace, isNavigationItemVisible, navigatePage } from "./navigationUx.js";

const workspace = {
  pages: ["Panoramica", "Opportunità", "GEO AI"],
  clients: [{ id: 1, name: "Studio Blu", url: "https://blu.example" }, { id: 2, name: "Studio Verde", url: "https://verde.example" }],
  tasks: [{ id: "t1", title: "Titolo duplicato", client: "Studio Blu", sourceClientId: 1, sourceUrl: "https://blu.example/corsi" }, { id: "t2", title: "Titolo duplicato", client: "Studio Verde", detail: "Controllare canonical" }],
};

test("search covers overlay sections, accents and multiword task context", () => {
  assert.equal(searchWorkspace("correzioni", workspace)[0].page, "Correzioni");
  assert.equal(searchWorkspace("opportunita", workspace)[0].page, "Opportunità");
  assert.equal(searchWorkspace("titolo verde", workspace)[0].taskId, "t2");
  assert.equal(searchWorkspace("canonical", workspace)[0].clientId, 2);
  assert.equal(searchWorkspace("blu.example/corsi", workspace)[0].taskId, "t1");
  assert.deepEqual(searchWorkspace("  ", workspace), []);
  assert.deepEqual(searchWorkspace("inesistente", workspace), []);
});

test("search does not hide matches before the UI can count them", () => {
  const tasks = Array.from({ length: 15 }, (_, id) => ({ id, title: "Audit" }));
  assert.equal(searchWorkspace("audit", { pages: [], clients: [], tasks }).length, 15);
});

test("simple navigation keeps current advanced page visible without exposing all tools", () => {
  assert.equal(isNavigationItemVisible("GEO AI", true, "simple", "GEO AI"), true);
  assert.equal(isNavigationItemVisible("Storico", true, "simple", "GEO AI"), false);
  assert.equal(isNavigationItemVisible("Storico", true, "advanced", "GEO AI"), true);
});

test("overlay navigation enables corrections before notifying route listeners", () => {
  const old = globalThis.window;
  const events = [];
  globalThis.window = { location: { hash: "#Panoramica" }, history: { pushState: (_state, _title, hash) => events.push(hash) }, dispatchEvent: event => events.push([event.type, globalThis.window.__seogrowCorrectionsMode]) };
  try {
    navigatePage("Correzioni");
    assert.deepEqual(events, ["#Correzioni", ["storage", true], ["seogrow-locationchange", true]]);
  } finally { if (old === undefined) delete globalThis.window; else globalThis.window = old; }
});

test("hash navigation notifica sincronicamente App e layer guidati anche ai confini di remount", () => {
  const old = globalThis.window;
  const events = [];
  globalThis.window = {
    location: { hash: "#Task", href: "http://127.0.0.1:5176/#Task" },
    history: { pushState() {} },
    dispatchEvent: event => events.push({ type: event.type, key: event.key, newValue: event.newValue }),
  };
  try {
    navigatePage("Audit SEO");
    assert.equal(globalThis.window.location.hash, "#Audit%20SEO");
    assert.deepEqual(events.map(event => event.type), ["storage", "hashchange", "seogrow-locationchange"]);
    assert.equal(events[0].key, "seogrow-selected-page-v1");
    assert.equal(events[0].newValue, JSON.stringify("Audit SEO"));
  } finally { if (old === undefined) delete globalThis.window; else globalThis.window = old; }
});
