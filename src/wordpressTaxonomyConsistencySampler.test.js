import test from "node:test";
import assert from "node:assert/strict";
import { classifySampler } from "../scripts/wordpress-taxonomy-consistency-sampler.mjs";

const state = (fp, marker = false) => ({ fp, len: 10, marker });
const sample = ({ fp = "a", marker = false, frontendFp = fp, frontendMarker = marker, dbRowCount = 1 } = {}) => ({
  api: state(fp, marker),
  inspection: state(fp, marker),
  database: state(fp, marker),
  cache: state(fp, marker),
  frontend: state(frontendFp, frontendMarker),
  dbRowCount,
});

test("classifica STABLE_CLEAN quando tutti i livelli restano coerenti senza marker", () => {
  const result = classifySampler([sample(), sample(), sample(), sample(), sample()]);
  assert.equal(result.code, "STABLE_CLEAN");
});

test("classifica STABLE_MARKER_PRESENT quando il marker resta coerente in tutti i livelli", () => {
  const result = classifySampler([sample({ marker: true }), sample({ marker: true }), sample({ marker: true })]);
  assert.equal(result.code, "STABLE_MARKER_PRESENT");
});

test("classifica STABLE_DIVERGENCE quando frontend e backend divergono ma lo stato non oscilla", () => {
  const s = sample({ frontendFp: "b", frontendMarker: true });
  const result = classifySampler([s, s, s]);
  assert.equal(result.code, "STABLE_DIVERGENCE");
});

test("classifica CROSS_REQUEST_STATE_OSCILLATION quando cambia lo stato tra campioni", () => {
  const result = classifySampler([sample({ fp: "a" }), sample({ fp: "b", marker: true }), sample({ fp: "a" })]);
  assert.equal(result.code, "CROSS_REQUEST_STATE_OSCILLATION");
});
