import test from "node:test";
import assert from "node:assert/strict";
import {
  GEO_SCOPE,
  buildGeoEvidenceModel,
  buildGeoOperationalItems,
  geoOpportunityInputs,
} from "./modules/geo/index.js";
import { buildSeoOpportunities } from "./modules/rank/index.js";

const audit = {
  url: "https://example.com/",
  analyzedAt: "2026-09-17T12:00:00Z",
  crawlerAccess: { oaiSearchBot: true, googlebot: false, gptBot: true },
  pagesAudited: ["https://example.com/", "https://example.com/about/"],
  schemaTypes: ["Organization", "WebSite"],
  signals: {
    hasAbout: true,
    hasContact: true,
    hasAuthor: false,
    hasUpdatedDate: true,
    pageWordCounts: [{ url: "https://example.com/", words: 640 }],
    pageExternalSources: [{ url: "https://example.com/", count: 2 }],
  },
  issues: [{
    id: "author-missing",
    severity: "Media",
    title: "Autore non rilevato",
    detail: "La pagina non espone un autore o revisore riconoscibile.",
    recommendation: "Aggiungi autore o revisore dove editorialmente corretto.",
    url: "https://example.com/",
  }],
};

const simulation = {
  results: [{
    question: "Come funziona il servizio?",
    coverage: "Parziale",
    answer: "Risposta parziale",
    gap: "Manca una spiegazione del processo.",
    bestUrl: "https://example.com/servizio/",
  }],
};

const observation = {
  summary: { ownedPresence: 1, brandTextPresence: 1, observed: 2 },
  queries: [
    { query: "servizio example", ownedPresence: true, ownedUrl: "https://example.com/" },
    { query: "consulenza example", ownedPresence: false, competitors: ["competitor.test"] },
  ],
};

test("GEO scope states what is and is not measured", () => {
  assert.ok(GEO_SCOPE.measures.some((item) => /schema/i.test(item)));
  assert.ok(GEO_SCOPE.measures.some((item) => /DataForSEO/i.test(item)));
  assert.ok(GEO_SCOPE.doesNotMeasure.some((item) => /citazioni reali/i.test(item)));
  assert.ok(GEO_SCOPE.doesNotMeasure.some((item) => /share of voice/i.test(item)));
});

test("GEO evidence model exposes observed facts without synthetic score", () => {
  const model = buildGeoEvidenceModel({ audit, simulation, observation });
  assert.equal(model.counts.pagesAudited, 2);
  assert.equal(model.counts.externalSourceLinks, 2);
  assert.equal(model.counts.diagnosticQuestions, 1);
  assert.equal(model.counts.serpQueriesObserved, 2);
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /"score"\s*:/i);
  assert.doesNotMatch(serialized, /"answerability"\s*:/i);
  const author = model.facets.flatMap((facet) => facet.evidence).find((item) => item.id === "author");
  assert.equal(author.state, "observed-gap");
});

test("GEO operational items preserve evidence type and explicit source", () => {
  const rows = buildGeoOperationalItems({ audit, simulation, observation });
  assert.ok(rows.some((item) => item.source === "Audit GEO" && item.evidenceKind === "observed"));
  assert.ok(rows.some((item) => item.source === "Diagnostica OpenAI" && item.evidenceKind === "diagnostic"));
  assert.ok(rows.some((item) => item.source === "DataForSEO SERP" && item.evidenceKind === "observed-serp"));
  assert.ok(rows.every((item) => item.id && item.title && item.detail && item.recommendation));
});

test("GEO evidence can enter canonical Opportunities with an actionable CTA", () => {
  const geoItems = geoOpportunityInputs({ audit, simulation, observation });
  const result = buildSeoOpportunities({ geoItems });
  assert.ok(result.opportunities.length >= 3);
  assert.ok(result.opportunities.every((item) => item.sourceTypes.includes("geo")));
  assert.ok(result.opportunities.every((item) => ["task", "content"].includes(item.action.kind)));
  assert.equal(result.rejected.length, 0);
});
