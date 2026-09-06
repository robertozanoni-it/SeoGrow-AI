import test from "node:test";
import assert from "node:assert/strict";
import { classifyPostWriteSamples } from "../scripts/wordpress-taxonomy-postwrite-sampler.mjs";

const state = (value) => ({ fp: value, len: value.length, marker: /marker/i.test(value) });
const sample = ({ api, inspection = api, database = api, cache = api, frontend = api, dbRowCount = 1, duplicateRows = false }) => ({
  api: state(api),
  inspection: state(inspection),
  database: state(database),
  cache: state(cache),
  frontend: state(frontend),
  raw: { api, inspection, database, cache, frontend },
  dbRowCount,
  duplicateRows,
});

const marker = "SeoGrow E2E marker";
const original = "Descrizione originale";

test("POSTWRITE_MARKER_STABLE quando marker resta identico su tutti i livelli", () => {
  const s = sample({ api: marker });
  assert.equal(classifyPostWriteSamples([s, s, s], { marker, original }).code, "POSTWRITE_MARKER_STABLE");
});

test("POSTWRITE_ORIGINAL_RESTORED quando tutti i livelli tornano al baseline", () => {
  const s = sample({ api: original });
  assert.equal(classifyPostWriteSamples([s, s, s], { marker, original }).code, "POSTWRITE_ORIGINAL_RESTORED");
});

test("POSTWRITE_CROSS_REQUEST_OSCILLATION quando gli snapshot cambiano", () => {
  const a = sample({ api: marker });
  const b = sample({ api: original });
  assert.equal(classifyPostWriteSamples([a, b, a], { marker, original }).code, "POSTWRITE_CROSS_REQUEST_OSCILLATION");
});

test("POSTWRITE_DIVERGENCE quando DB/API/frontend non concordano stabilmente", () => {
  const s = sample({ api: marker, frontend: original });
  assert.equal(classifyPostWriteSamples([s, s, s], { marker, original }).code, "POSTWRITE_DIVERGENCE");
});
