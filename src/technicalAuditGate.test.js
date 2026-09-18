import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runner = await readFile(new URL("../scripts/qa-runner.mjs", import.meta.url), "utf8");
const browser = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");
const matrix = await readFile(new URL("../scripts/qa-browser-matrix.mjs", import.meta.url), "utf8");
const qaMatrix = await readFile(new URL("../scripts/qa-matrix.mjs", import.meta.url), "utf8");
const api = await readFile(new URL("./api.js", import.meta.url), "utf8");
const settingsGate = await readFile(new URL("./settingsPolicyGate.test.js", import.meta.url), "utf8");
const wordpressSession = await readFile(new URL("./system/integrations/wordpressSession.js", import.meta.url), "utf8");

test("Gate 19 executes lint, unit/integration/storage, build and browser in release QA", () => {
  assert.match(runner, /await run\("lint"/);
  assert.match(runner, /testName = `test-\\$\\{String\\(index \+ 1\\)/);
  assert.match(runner, /"--test-concurrency=1"/);
  assert.match(runner, /TEST_WORKERS/);
  assert.match(runner, /name\.endsWith\("\.test\.js"\)/);
  assert.match(runner, /production-build/);
  assert.match(runner, /await run\("browser"/);
  assert.match(runner, /validateBrowserEvidence\(browser, report, requiredScenarios\(mode\)\)/);
});

test("Gate 19 browser smoke fails on uncaught exceptions, console errors and failed network calls", () => {
  assert.match(browser, /Runtime\.exceptionThrown/);
  assert.match(browser, /Runtime\.consoleAPICalled/);
  assert.match(browser, /params\?\.type === "error"/);
  assert.match(browser, /Network\.loadingFailed/);
  assert.match(browser, /canceled !== true/);
  assert.match(browser, /Uncaught browser exceptions/);
  assert.match(browser, /Browser console errors/);
  assert.match(browser, /Unexpected browser network failures/);
});

test("Gate 19 concurrency and durable storage scenarios are release-enforced", () => {
  for (const id of ["TASK-004", "STORAGE-QUEUE-001", "STRESS-500", "IDB-REAL-001"]) {
    assert.match(matrix, new RegExp(id));
    assert.match(qaMatrix, new RegExp(id));
  }
  assert.match(matrix, /IDBObjectStore\.prototype\.put/);
  assert.match(matrix, /QuotaExceededError/);
  assert.match(matrix, /tx\.abort\(\)/);
  assert.match(matrix, /reloadImmediate/);
  assert.match(matrix, /new Set\(after\.map\(t => t\.id\)\)\.size/);
});

test("Gate 19 provider/network failures settle visibly and recover", () => {
  assert.match(matrix, /ERROR-001/);
  for (const failure of ["400", "500", "offline", "invalid", "empty", "timeout"]) {
    assert.match(matrix, new RegExp(`\\b${failure}\\b`));
  }
  assert.match(matrix, /Errore Google:/);
  assert.match(matrix, /recovery after API failures/);
});

test("Gate 19 project concurrency aborts stale scoped requests", () => {
  assert.match(api, /const scopedRequests = new Set\(\)/);
  assert.match(api, /isProjectScopedRequest/);
  assert.match(api, /seogrow-storage-ok/);
  assert.match(api, /Progetto cambiato/);
  assert.match(api, /entry\.controller\.abort/);
  assert.match(api, /assertProjectStillSelected/);
  assert.match(api, /AbortSignal\.any/);
});

test("Gate 19 security boundaries keep writes gated and secrets transient", () => {
  assert.match(settingsGate, /write kill-switch blocks apply\/create paths but keeps preview and rollback available/);
  assert.match(api, /PROJECT_WRITES_DISABLED/);
  for (const path of ["/api/wordpress/draft", "/api/wordpress/live-apply", "/api/wordpress/taxonomy-apply", "/api/wordpress/elementor-shared-link-apply"]) {
    assert.match(api, new RegExp(path.replaceAll("/", "\\/")));
  }
  const writeSet = api.match(/export const isWordPressWriteRequest[\s\S]*?\]\)\.has\(String\(path \|\| ""\)\);/)?.[0] || "";
  assert.ok(writeSet, "WordPress write boundary must stay explicit");
  assert.doesNotMatch(writeSet, /rollback/i);
  assert.doesNotMatch(writeSet, /preview/i);
  assert.match(wordpressSession, /const sessions = new Map\(\)/);
  assert.match(wordpressSession, /30 \* 60_000/);
  assert.doesNotMatch(wordpressSession, /localStorage|workspaceStorage|writeWorkspace/i);
});

test("Gate 19 release runtime does not inherit provider credentials or dotenv", () => {
  assert.match(runner, /Do not inherit credentials or read the user's dotenv file/);
  assert.match(runner, /const env = \{ PATH: process\.env\.PATH, HOME: process\.env\.HOME, TMPDIR:/);
  assert.doesNotMatch(runner, /OPENAI_API_KEY:\s*process\.env|DATAFORSEO_(?:LOGIN|PASSWORD):\s*process\.env/);
  assert.match(runner, /APP_API_TOKEN: "qa-token-"\.repeat\(8\)/);
  assert.match(runner, /CREDENTIAL_ENCRYPTION_KEY: "qa-key-"\.repeat\(10\)/);
});
