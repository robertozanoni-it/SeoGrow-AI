import process from "node:process";

const appUrl = String(process.env.SEOGROW_APP_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const apiToken = String(process.env.APP_API_TOKEN || "").trim();
const siteUrl = String(process.env.SEOGROW_WP_SITE_URL || "").trim();
const targetUrl = String(process.env.SEOGROW_WP_ROLE_E2E_TARGET_URL || "").trim();
const targetId = Number(process.env.SEOGROW_WP_ROLE_E2E_TARGET_ID || 0);
const resource = String(process.env.SEOGROW_WP_ROLE_E2E_RESOURCE || "pages").trim();
const allowWrites = process.env.SEOGROW_ROLE_E2E_ALLOW_WRITES === "YES_I_UNDERSTAND";

if (!apiToken) throw new Error("Imposta APP_API_TOKEN con il token dell'istanza SeoGrow prima del test ruolo-per-ruolo.");
if (!siteUrl || !targetUrl || !Number.isSafeInteger(targetId) || targetId <= 0) {
  throw new Error("Imposta SEOGROW_WP_SITE_URL, SEOGROW_WP_ROLE_E2E_TARGET_URL e SEOGROW_WP_ROLE_E2E_TARGET_ID prima del test ruolo-per-ruolo.");
}
if (!new Set(["pages", "posts"]).has(resource)) throw new Error("SEOGROW_WP_ROLE_E2E_RESOURCE deve essere pages o posts.");

const roles = [
  { name: "administrator", prefix: "SEOGROW_WP_ADMIN", expectEditable: true },
  { name: "editor", prefix: "SEOGROW_WP_EDITOR", expectEditable: true },
  { name: "subscriber", prefix: "SEOGROW_WP_SUBSCRIBER", expectEditable: false },
];

const credentialsFor = (role) => ({
  username: String(process.env[`${role.prefix}_USERNAME`] || "").trim(),
  applicationPassword: String(process.env[`${role.prefix}_APPLICATION_PASSWORD`] || "").trim(),
});

async function post(path, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-seogrow-token": apiToken },
    redirect: "manual",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }
  return { status: response.status, ok: response.ok, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runRole(role) {
  const credentials = credentialsFor(role);
  if (!credentials.username || !credentials.applicationPassword) {
    return { role: role.name, skipped: true, reason: `Credenziali ${role.prefix}_* assenti` };
  }

  const common = { siteUrl, targetUrl, ...credentials };
  const connection = await post("/api/wordpress/connection-check", common);
  assert(connection.ok, `${role.name}: connection-check fallito (${connection.status}) ${connection.data?.error || ""}`);

  const inspect = await post("/api/wordpress/inspect-fast", { ...common, url: targetUrl });
  if (role.expectEditable) {
    assert(inspect.ok, `${role.name}: inspect-fast dovrebbe riuscire ma ha restituito ${inspect.status}: ${inspect.data?.error || ""}`);
    assert(Number(inspect.data?.entity?.id) === targetId, `${role.name}: inspect-fast ha restituito un'entità diversa dal target #${targetId}`);
  } else {
    assert(!inspect.ok, `${role.name}: inspect-fast non deve esporre context=edit a un ruolo non editoriale`);
  }

  const preview = await post("/api/wordpress/live-preview", {
    ...common,
    resource,
    id: targetId,
    changes: { title: `SeoGrow role E2E preview ${role.name}` },
    issue: { source: "role-e2e", role: role.name },
    adapter: "WordPress",
  });

  if (role.expectEditable) {
    assert(preview.ok, `${role.name}: live-preview dovrebbe riuscire ma ha restituito ${preview.status}: ${preview.data?.error || ""}`);
    assert(preview.data?.ok === true && preview.data?.approvalToken, `${role.name}: anteprima senza approval token`);
    if (allowWrites) {
      const apply = await post("/api/wordpress/live-apply", {
        approvalToken: preview.data.approvalToken,
        ...credentials,
      });
      assert(apply.ok && apply.data?.liveApplied === true, `${role.name}: live-apply autorizzato non confermato (${apply.status}) ${apply.data?.error || ""}`);
    }
  } else {
    assert(!preview.ok, `${role.name}: live-preview deve fallire per un ruolo senza capacità di modifica`);
  }

  return {
    role: role.name,
    skipped: false,
    connection: connection.status,
    inspect: inspect.status,
    preview: preview.status,
    writeAttempted: role.expectEditable && allowWrites,
  };
}

const results = [];
for (const role of roles) results.push(await runRole(role));

const executed = results.filter((item) => !item.skipped);
assert(executed.length >= 2, "Servono almeno due ruoli configurati per considerare utile il test E2E ruolo-per-ruolo.");
console.log(JSON.stringify({ ok: true, allowWrites, siteUrl, targetUrl, resource, targetId, results }, null, 2));
