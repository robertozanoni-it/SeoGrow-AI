import test from "node:test";
import assert from "node:assert/strict";
import { isTransientDiagnosticsFailure } from "../scripts/wordpress-taxonomy-diagnostics-retry.mjs";

test("riconosce UND_ERR_CONNECT_TIMEOUT come errore transitorio", () => {
  assert.equal(isTransientDiagnosticsFailure({ stderr: "cause: UND_ERR_CONNECT_TIMEOUT" }), true);
});

test("riconosce HTTP 503 come errore transitorio", () => {
  assert.equal(isTransientDiagnosticsFailure({ stderr: "Connector taxonomy-diagnostics: HTTP 503" }), true);
});

test("non ritenta incoerenze logiche della diagnostica", () => {
  assert.equal(isTransientDiagnosticsFailure({ stderr: "DIAGNOSTICA NON COERENTE: backend e frontend divergono" }), false);
});

test("non ritenta errori HTTP non transitori", () => {
  assert.equal(isTransientDiagnosticsFailure({ stderr: "Connector taxonomy-diagnostics: HTTP 409" }), false);
});
