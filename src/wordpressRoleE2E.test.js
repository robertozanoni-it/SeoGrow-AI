import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const script = await readFile(new URL("../scripts/wordpress-role-e2e.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("il batch ruolo-per-ruolo copre admin editor e subscriber", () => {
  for (const role of ["administrator", "editor", "subscriber"]) assert.match(script, new RegExp(`name: "${role}"`));
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

function runHarness(appUrl, token = "role-test-local-token", scriptUrl = new URL("../scripts/wordpress-role-e2e.mjs", import.meta.url)) {
  const env = {
    ...process.env,
    APP_API_TOKEN: token,
    SEOGROW_APP_URL: appUrl,
    SEOGROW_WP_SITE_URL: "https://wordpress.example",
    SEOGROW_WP_ROLE_E2E_TARGET_URL: "https://wordpress.example/fixture/",
    SEOGROW_WP_ROLE_E2E_TARGET_ID: "123",
    SEOGROW_WP_ROLE_E2E_RESOURCE: "pages",
    SEOGROW_ROLE_E2E_ALLOW_WRITES: "",
  };
  for (const prefix of ["ADMIN", "EDITOR", "SUBSCRIBER"]) {
    env[`SEOGROW_WP_${prefix}_USERNAME`] = prefix.toLowerCase();
    env[`SEOGROW_WP_${prefix}_APPLICATION_PASSWORD`] = "fixture-password";
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(scriptUrl)], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("il launcher carica lo script da cartelle con spazi e caratteri URL", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "Seo Grow QA # % "));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "wordpress-role-e2e.mjs");
  await writeFile(file, script);
  const result = await runHarness("http://127.0.0.1:1", "", pathToFileURL(file));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Imposta APP_API_TOKEN/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
});

async function localApi(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("il launcher autentica tutte le API locali e verifica tre ruoli senza write", async (t) => {
  const requests = [];
  const appUrl = await localApi(t, async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ path: req.url, username: body.username, token: req.headers["x-seogrow-token"] });
    res.setHeader("content-type", "application/json");
    if (req.headers["x-seogrow-token"] !== "role-test-local-token") {
      res.writeHead(401).end(JSON.stringify({ error: "API token required" }));
    } else if (req.url.endsWith("connection-check")) {
      res.end(JSON.stringify({ ok: true }));
    } else if (body.username === "subscriber") {
      res.writeHead(400).end(JSON.stringify({ error: "context=edit denied" }));
    } else {
      res.end(JSON.stringify({ ok: true, entity: { id: 123 }, approvalToken: "fixture-approval" }));
    }
  });
  const result = await runHarness(appUrl);
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.results.length, 3);
  assert.equal(report.allowWrites, false);
  assert.equal(requests.length, 9);
  assert.ok(requests.every((req) => req.token === "role-test-local-token" && !req.path.endsWith("live-apply")));
  assert.ok(report.results.every((role) => !role.skipped && !role.writeAttempted));
  assert.doesNotMatch(result.stdout, /fixture-password|role-test-local-token|fixture-approval/);
});

test("il launcher rifiuta token assente e redirect prima di inoltrare credenziali", async (t) => {
  let requests = 0;
  const appUrl = await localApi(t, (req, res) => {
    requests += 1;
    res.writeHead(307, { location: "/redirect-target" }).end();
  });
  const missing = await runHarness(appUrl, "");
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /Imposta APP_API_TOKEN/);
  assert.equal(requests, 0);
  const redirected = await runHarness(appUrl);
  assert.notEqual(redirected.code, 0);
  assert.match(redirected.stderr, /connection-check fallito \(307\)/);
  assert.equal(requests, 1);
});
