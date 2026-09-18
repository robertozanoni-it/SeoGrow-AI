import test from "node:test";
import assert from "node:assert/strict";
import { isRegisteredPage } from "./core/modules/moduleRegistry.js";
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
    assert.deepEqual(events, ["#Correzioni", ["storage", true], ["hashchange", true], ["seogrow-locationchange", true]]);
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

test("la terminologia Suite naviga sulle route legacy senza cambiare il valore persistito", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const events = [];
  globalThis.window = {
    location: { hash: "#Panoramica", href: "http://127.0.0.1:5176/#Panoramica" },
    history: { pushState() {} },
    dispatchEvent: event => events.push({ type: event.type, newValue: event.newValue }),
  };
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  try {
    navigatePage("Audit & Fix");
    assert.equal(globalThis.window.location.hash, "#Audit%20SEO");
    assert.equal(events[0].newValue, JSON.stringify("Audit SEO"));
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test("le viste legacy restano compatibili ma non sono destinazioni primarie", async () => {
  const { SUITE_NAVIGATION } = await import("./suite/navigationModel.js");
  const pages = SUITE_NAVIGATION.flatMap((group) => group.items.map((entry) => entry.page));
  for (const legacyPage of ["Problemi", "Storico", "SeoGrow AI"]) {
    assert.equal(isRegisteredPage(legacyPage), true);
    assert.equal(pages.includes(legacyPage), false);
  }
});


test("le route legacy navigano direttamente al loro owner canonico", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const events = [];
  globalThis.window = {
    location: { hash: "#Panoramica", href: "http://127.0.0.1:5176/#Panoramica" },
    history: { pushState() {} },
    dispatchEvent: event => events.push({ type: event.type, newValue: event.newValue }),
  };
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  try {
    navigatePage("Storico");
    assert.equal(globalThis.window.location.hash, "#Centro%20progetto");
    assert.equal(events.at(-3)?.newValue, JSON.stringify("Centro progetto"));

    events.length = 0;
    navigatePage("SeoGrow AI");
    assert.equal(globalThis.window.location.hash, "#SEO%20Agent");
    assert.equal(events.at(-3)?.newValue, JSON.stringify("SEO Agent"));
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
