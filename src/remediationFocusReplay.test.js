import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridge = await readFile(new URL("./RemediationFocusReplay.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("la proposta automatica ripete il focus solo quando i controlli reali sono montati", () => {
  assert.match(bridge, /proposal-remediation-slot \.remediation-host/);
  assert.match(bridge, /proposal-remediation-slot \.wp-live-remediation-v2/);
  assert.match(bridge, /requestAnimationFrame\(check\)/);
  assert.match(bridge, /seogrow-remediation-open/);
  assert.match(bridge, /__seogrowMountReplay/);
});

test("il replay non crea un ciclo sui propri eventi", () => {
  assert.match(bridge, /detail\[REPLAY_MARK\]/);
  assert.match(bridge, /if \(!detail \|\| detail\[REPLAY_MARK\]/);
});

test("il bridge è installato globalmente prima del render React", () => {
  assert.match(main, /import ['"]\.\/RemediationFocusReplay['"]/);
  assert.ok(main.indexOf("./RemediationFocusReplay") < main.indexOf("ReactDOM.createRoot"));
});
