import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

test("Posizionamenti preserves the last valid run when DataForSEO refresh fails", () => {
  const start = app.indexOf("function RankingsPage(");
  const end = app.indexOf("\nfunction ContentPage", start);
  const rankings = app.slice(start, end);
  assert.match(rankings, /response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(rankings, /!Array\.isArray\(data\.rankings\)/);
  const catchAt = rankings.indexOf("} catch (err)");
  assert.ok(catchAt > 0);
  assert.ok(rankings.indexOf("onSave(data)") < catchAt);
  const catchBody = rankings.slice(catchAt, rankings.indexOf("} finally", catchAt));
  assert.doesNotMatch(catchBody, /onSave\(/);
  assert.match(rankings, /L’ultimo controllo valido resta disponibile nelle tabelle e nei trend/);
});
