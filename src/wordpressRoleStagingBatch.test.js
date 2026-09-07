import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runStagingRoleBatch } from "../scripts/wordpress-role-staging-batch.mjs";

function fixture({ failPassword = false, changeIdentity = false, collision = false } = {}) {
  const calls = [];
  const users = new Map();
  let nextId = 10;
  let harnessRan = false;
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  const options = {
    username: "admin", applicationPassword: "admin-secret", apiToken: "local-secret",
    confirmation: "staging.yogabuenaonda.it",
    localFetch: async (url, options) => {
      assert.equal(new URL(url).hostname, "127.0.0.1");
      assert.equal(options.headers["x-seogrow-token"], "local-secret");
      return json({ version: "1.4.3" });
    },
    transport: async (url, options) => {
      const parsed = new URL(url);
      const route = parsed.pathname.split("/wp/v2/")[1];
      assert.equal(parsed.origin, "https://staging.yogabuenaonda.it");
      assert.equal(options.redirect, "manual");
      assert.match(options.headers.authorization, /^Basic /);
      calls.push({ route, method: options.method });
      if (route === "users/me") return json({ id: 1, roles: ["administrator"] });
      if (route === "posts") {
        assert.equal(options.method, "GET");
        return json([{ id: 23, link: "https://staging.yogabuenaonda.it/fixture/" }]);
      }
      if (route === "users") {
        if (collision) return json({ code: "existing_user_login" }, 400);
        const body = JSON.parse(options.body);
        const user = { ...body, id: ++nextId };
        users.set(user.id, user);
        return json(user, 201);
      }
      const id = Number(route.split("/")[1]);
      if (route.endsWith("application-passwords")) {
        if (failPassword && id === 12) return json({}, 403);
        return json({ password: `app-secret-${id}` }, 201);
      }
      if (options.method === "DELETE") {
        assert.equal(parsed.searchParams.get("force"), "true");
        assert.equal(parsed.searchParams.get("reassign"), "1");
        users.delete(id);
        return json({ deleted: true });
      }
      const user = users.get(id);
      return json(changeIdentity && harnessRan ? { ...user, email: "someone-else@example.invalid" } : user);
    },
    harness: async ({ credentials, target }) => {
      harnessRan = true;
      assert.deepEqual(Object.keys(credentials), ["ADMIN", "EDITOR", "SUBSCRIBER"]);
      assert.equal(target.id, 23);
      return { ok: true, allowWrites: false, results: ["administrator", "editor", "subscriber"].map((role) => ({ role, skipped: false, writeAttempted: false })) };
    },
  };
  return { options, calls, users };
}

test("batch staging runs all roles and deletes only the two created identities", async () => {
  const { options, calls, users } = fixture();
  const report = await runStagingRoleBatch(options);
  assert.equal(report.ok, true);
  assert.equal(report.results.length, 3);
  assert.equal(report.cleanup.length, 2);
  assert.deepEqual(report.pendingAccounts, []);
  assert.equal(users.size, 0);
  assert.ok(calls.filter((call) => call.method !== "GET").every((call) => call.route.startsWith("users")));
  assert.doesNotMatch(JSON.stringify(report), /admin-secret|local-secret|app-secret/);
});

test("batch cleans both created users after second app password fails", async () => {
  const { options, users } = fixture({ failPassword: true });
  const report = await runStagingRoleBatch(options);
  assert.equal(report.ok, false);
  assert.match(report.error, /HTTP 403/);
  assert.equal(report.cleanup.length, 2);
  assert.equal(users.size, 0);
});

test("batch refuses existing accounts and identities changed before cleanup", async () => {
  const collision = fixture({ collision: true });
  const failed = await runStagingRoleBatch(collision.options);
  assert.equal(failed.ok, false);
  assert.equal(collision.calls.filter((call) => call.method === "DELETE").length, 0);
  const changed = fixture({ changeIdentity: true });
  const report = await runStagingRoleBatch(changed.options);
  assert.equal(report.ok, false);
  assert.equal(report.pendingAccounts.length, 2);
  assert.equal(changed.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("batch requires exact host confirmation before any network call", async () => {
  const { options, calls } = fixture();
  options.confirmation = "yogabuenaonda.it";
  options.localFetch = () => assert.fail("No network expected");
  const report = await runStagingRoleBatch(options);
  assert.equal(report.ok, false);
  assert.equal(calls.length, 0);
});

test("checkpoint failure during cleanup does not prevent remaining cleanup", async () => {
  const { options, users } = fixture();
  options.checkpoint = (report) => { if (report.cleanup.length) throw new Error("disk full"); };
  const report = await runStagingRoleBatch(options);
  assert.equal(report.ok, false);
  assert.equal(report.checkpointError, true);
  assert.equal(users.size, 0);
});

test("standalone batch pins WP REST and forces child content writes off", async () => {
  const script = await readFile(new URL("../scripts/wordpress-role-staging-batch.mjs", import.meta.url), "utf8");
  assert.match(script, /transport = pinnedHttpsFetch/);
  assert.match(script, /SEOGROW_ROLE_E2E_ALLOW_WRITES: ""/);
  assert.doesNotMatch(script, /await fetch\(/);
  assert.doesNotMatch(script, /\.\.\.process.env/);
});
