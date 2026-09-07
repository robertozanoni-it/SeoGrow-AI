import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../scripts/wordpress-role-e2e.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("il batch ruolo-per-ruolo copre admin editor e subscriber", () => {
  for (const role of ["administrator", "editor", "subscriber"]) assert.match(script, new RegExp(`name: \\\"${role}\\\"`));
});

test("il batch resta read-only di default e richiede conferma esplicita per write", () => {
  assert.match(script, /SEOGROW_ROLE_E2E_ALLOW_WRITES === "YES_I_UNDERSTAND"/);
  assert.match(script, /if \(allowWrites\)/);
  assert.match(script, /live-apply/);
});

test("subscriber deve fallire su inspect edit-context e live-preview", () => {
  assert.match(script, /expectEditable: false/);
  assert.match(script, /inspect-fast non deve esporre context=edit/);
  assert.match(script, /live-preview deve fallire/);
});

test("il comando npm del batch ruolo-per-ruolo è esposto", () => {
  assert.equal(pkg.scripts["test:wordpress-role-e2e"], "node scripts/wordpress-role-e2e.mjs");
});
