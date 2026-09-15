import test from "node:test";
import assert from "node:assert/strict";
import { formatUiDate } from "./dateFormat.js";

test("shared UI date formatter rejects missing and invalid dates", () => {
  assert.equal(formatUiDate(null), "Data non disponibile");
  assert.equal(formatUiDate("not-a-date"), "Data non disponibile");
  assert.match(formatUiDate("2026-09-15T12:00:00Z"), /2026/);
});
