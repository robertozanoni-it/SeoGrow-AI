import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pinnedHttpsFetch } from "../server/pinnedHttpsFetch.js";

const siteUrl = "https://staging.yogabuenaonda.it";
const appUrl = "http://127.0.0.1:8787";

export async function runStagingRoleBatch({ username, applicationPassword, apiToken, confirmation, transport = pinnedHttpsFetch, localFetch = fetch, harness = runHarness, checkpoint = () => {} }) {
  const report = { siteUrl, ok: false, contentWrites: false, results: [], cleanup: [], pendingAccounts: [] };
  const created = [];
  const secrets = [applicationPassword, apiToken, Buffer.from(`${username}:${applicationPassword}`).toString("base64")].filter(Boolean);
  const clean = (text) => secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), String(text));
  const save = () => checkpoint(JSON.parse(JSON.stringify(report)));
  let adminId;
  let matrixPassed = false;
  async function wp(route, method = "GET", body) {
    const response = await transport(`${siteUrl}/wp-json/wp/v2/${route}`, {
      method, redirect: "manual", timeout: 20_000, signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`${method} ${route.split("?")[0]}: HTTP ${response.status}`);
    return response.json();
  }
  try {
    if (confirmation !== "staging.yogabuenaonda.it") throw new Error("Conferma esplicita dello staging assente.");
    if (!username || !applicationPassword || !apiToken) throw new Error("Credenziali o token API mancanti.");
    const session = await localFetch(`${appUrl}/api/session`, { headers: { "x-seogrow-token": apiToken }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (!session.ok) throw new Error(`API locale: HTTP ${session.status}`);
    const admin = await wp("users/me?context=edit");
    adminId = Number(admin.id);
    if (!Number.isSafeInteger(adminId) || adminId <= 0 || !admin.roles?.includes("administrator")) throw new Error("Amministratore staging non confermato.");
    const posts = await wp("posts?context=edit&status=publish&per_page=1");
    const target = posts[0];
    if (!Number.isSafeInteger(target?.id) || target.id <= 0 || new URL(target.link).origin !== siteUrl) throw new Error("Nessun post pubblicato valido sullo staging.");
    report.targetId = target.id;
    report.targetUrl = target.link;
    const credentials = { ADMIN: { username, applicationPassword } };
    for (const role of ["editor", "subscriber"]) {
      const login = `seogrow-qa-${role}`;
      const email = `${login}+${crypto.randomUUID()}@example.invalid`;
      report.pendingAccounts.push(login);
      save(); // Persist intent before a potentially lost creation response. Never retry creation blindly.
      const user = await wp("users", "POST", { username: login, email, password: crypto.randomBytes(32).toString("hex"), roles: [role] });
      if (!Number.isSafeInteger(user.id) || user.id <= 0 || user.id === adminId) throw new Error(`ID nuovo utente ${role} non valido; verificare manualmente.`);
      const record = { id: user.id, login, email, role };
      created.push(record);
      save();
      const identity = await wp(`users/${user.id}?context=edit`);
      if (identity.username !== login || identity.email !== email || identity.roles?.length !== 1 || identity.roles[0] !== role) throw new Error(`Identità temporanea ${role} non confermata.`);
      const password = await wp(`users/${user.id}/application-passwords`, "POST", { name: "SeoGrow temporary role batch" });
      if (!password.password) throw new Error(`Password applicativa ${role} assente.`);
      secrets.push(password.password, Buffer.from(`${login}:${password.password}`).toString("base64"));
      credentials[role.toUpperCase()] = { username: login, applicationPassword: password.password };
    }
    const result = await harness({ credentials, apiToken, target });
    if (result.ok !== true || result.allowWrites !== false || result.results?.length !== 3 || result.results.some((role) => role.skipped || role.writeAttempted)) throw new Error("Matrice incompleta o modalità write inattesa.");
    report.results = result.results;
    matrixPassed = true;
  } catch (error) {
    report.error = clean(error.message);
  } finally {
    for (const user of created.reverse()) {
      try {
        const identity = await wp(`users/${user.id}?context=edit`);
        if (identity.username !== user.login || identity.email !== user.email || identity.roles?.length !== 1 || identity.roles[0] !== user.role) throw new Error("Identità cambiata; eliminazione bloccata.");
        const deleted = await wp(`users/${user.id}?force=true&reassign=${adminId}`, "DELETE");
        if (deleted.deleted !== true) throw new Error("Eliminazione non confermata.");
        report.cleanup.push({ id: user.id, role: user.role, deleted: true });
        report.pendingAccounts = report.pendingAccounts.filter((login) => login !== user.login);
      } catch (error) {
        report.cleanup.push({ id: user.id, role: user.role, deleted: false, error: clean(error.message) });
        report.ok = false;
      }
      try { save(); } catch { report.ok = false; report.checkpointError = true; }
    }
    report.ok = matrixPassed && !report.pendingAccounts.length && !report.checkpointError && report.cleanup.every((item) => item.deleted);
    try { save(); } catch { report.ok = false; report.checkpointError = true; }
  }
  return report;
}

function runHarness({ credentials, apiToken, target }) {
  // Construct a minimal environment so inherited write flags or unrelated credentials cannot enter the child.
  const env = { PATH: process.env.PATH, APP_API_TOKEN: apiToken, SEOGROW_APP_URL: appUrl, SEOGROW_WP_SITE_URL: siteUrl, SEOGROW_WP_ROLE_E2E_TARGET_URL: target.link, SEOGROW_WP_ROLE_E2E_TARGET_ID: String(target.id), SEOGROW_WP_ROLE_E2E_RESOURCE: "posts", SEOGROW_ROLE_E2E_ALLOW_WRITES: "" };
  for (const [role, credential] of Object.entries(credentials)) {
    env[`SEOGROW_WP_${role}_USERNAME`] = credential.username;
    env[`SEOGROW_WP_${role}_APPLICATION_PASSWORD`] = credential.applicationPassword;
  }
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./wordpress-role-e2e.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 300_000, maxBuffer: 1024 * 1024 });
  if (child.status !== 0) throw new Error(child.stderr?.match(/^Error: .+$/m)?.[0] || "Harness interrotto o scaduto.");
  return JSON.parse(child.stdout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL("../", import.meta.url);
  const dir = new URL(".qa-runtime/", root);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = new URL(`role-staging-${crypto.randomUUID()}.json`, dir);
  try {
    const report = await runStagingRoleBatch({
      username: process.env.SEOGROW_WP_ADMIN_USERNAME,
      applicationPassword: process.env.SEOGROW_WP_ADMIN_APPLICATION_PASSWORD,
      apiToken: fs.readFileSync(new URL(".seogrow-data/app-token", root), "utf8").trim(),
      confirmation: process.env.SEOGROW_ROLE_BATCH_CONFIRM_HOST,
      checkpoint: (data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 }),
    });
    console.log(JSON.stringify(report, null, 2));
    console.log(`Report: ${fileURLToPath(file)}`);
    console.log("La password amministrativa resta valida: revocarla dal profilo staging al termine del collaudo.");
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error("Impossibile avviare il batch: controllare token locale e permessi della cartella report.");
    process.exitCode = 1;
  }
}
