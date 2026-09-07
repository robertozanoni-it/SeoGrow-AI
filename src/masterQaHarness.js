import { apiFetch } from "./api.js";
import { correctionCredentials } from "./correctionCredentials.js";
import { flushWorkspace, openWorkspaceDb, readWorkspace, workspaceStorage } from "./workspaceDatabase.js";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";

const readJson = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

export const MANUAL_MASTER_QA_CHECKS = [
  "Restore con crash fisico browser/OS e quota reale",
  "WordPress CAS/stale/rollback su sito reale",
  "Lost-response recovery su nuova sessione",
  "Elementor save/render/cache/rollback su staging",
  "Agent doppio avvio/cancel/approvazione stale da UI",
  "Responsive desktop/tablet/mobile, zoom 200% e tastiera",
  "Security environment con ruoli WordPress e redirect controllati",
];

export function summarizeMasterQa(results) {
  const counts = { PASS: 0, FAIL: 0, MANUAL: 0, INFO: 0 };
  for (const item of results) counts[item.status] = (counts[item.status] || 0) + 1;
  return {
    counts,
    overall: counts.FAIL > 0 ? "FAIL" : counts.MANUAL > 0 ? "PASS_PARZIALE" : "PASS",
  };
}

async function readCorrections(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("corrections", "readonly");
    const request = tx.objectStore("corrections").getAll();
    tx.oncomplete = () => resolve(request.result || []);
    tx.onabort = () => reject(tx.error || new Error("Lettura correzioni interrotta"));
  });
}

async function checkWorkspace() {
  const db = await openWorkspaceDb();
  try {
    const workspace = await readWorkspace(db);
    const corrections = await readCorrections(db);
    const generation = workspace.get("__generation");
    return {
      status: generation ? "PASS" : "FAIL",
      area: "Workspace",
      detail: generation
        ? `IndexedDB aperto; ${workspace.size} chiavi workspace; ${corrections.length} correzioni; generation presente.`
        : "Generation workspace assente.",
    };
  } finally { db.close(); }
}

function checkClientSelection() {
  const clients = readJson(CLIENTS_KEY, []);
  const selected = Number(readJson(SELECTED_CLIENT_KEY, 0));
  const match = clients.find((item) => Number(item?.id) === selected);
  return {
    status: selected > 0 && match ? "PASS" : "FAIL",
    area: "Cliente selezionato",
    detail: match ? `Cliente ${selected} presente e selezionato.` : "Il cliente selezionato non coincide con la lista clienti.",
  };
}

async function checkCorrectionIsolation() {
  const db = await openWorkspaceDb();
  try {
    const rows = await readCorrections(db);
    const bad = rows.filter((row) => !Number.isSafeInteger(Number(row?.clientId)) || Number(row.clientId) <= 0);
    const grouped = new Map();
    for (const row of rows) {
      const id = Number(row.clientId);
      grouped.set(id, (grouped.get(id) || 0) + 1);
    }
    return {
      status: bad.length ? "FAIL" : "PASS",
      area: "Storico multi-cliente",
      detail: bad.length
        ? `${bad.length} correzioni senza clientId valido.`
        : `${rows.length} correzioni tutte client-scoped; clienti nello storico: ${[...grouped.keys()].join(", ") || "nessuno"}.`,
    };
  } finally { db.close(); }
}

async function checkCredentialIsolation() {
  const record = { clientId: 101, siteUrl: "https://qa-a.example" };
  let clientRejected = false;
  let siteRejected = false;
  try {
    correctionCredentials(record, { clientId: 202, siteUrl: "https://qa-a.example", username: "qa", applicationPassword: "x" });
  } catch { clientRejected = true; }
  try {
    correctionCredentials(record, { clientId: 101, siteUrl: "https://qa-b.example", username: "qa", applicationPassword: "x" });
  } catch { siteRejected = true; }
  const accepted = correctionCredentials(record, {
    clientId: 101,
    siteUrl: "https://qa-a.example",
    username: "qa",
    applicationPassword: "x",
  });
  return {
    status: clientRejected && siteRejected && accepted?.siteUrl === "https://qa-a.example" ? "PASS" : "FAIL",
    area: "Credenziali WordPress",
    detail: "Mismatch cliente e sito respinti; coppia cliente+sito corretta accettata.",
  };
}

async function checkProjectSwitchAbort() {
  const originalFetch = window.fetch;
  const originalSelected = workspaceStorage.getItem(SELECTED_CLIENT_KEY);
  const current = Number(readJson(SELECTED_CLIENT_KEY, 0)) || 1;
  const alternate = current === 999999 ? 999998 : 999999;
  let result = "";

  window.fetch = (url, options = {}) => {
    if (!String(url).includes("/api/wordpress/qa-master-delay")) return originalFetch(url, options);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })), 4000);
      const abort = () => {
        window.clearTimeout(timer);
        reject(new DOMException("QA aborted", "AbortError"));
      };
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    });
  };

  try {
    const pending = apiFetch("/api/wordpress/qa-master-delay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then(() => "unexpected-success").catch((error) => error.message);

    workspaceStorage.setItem(SELECTED_CLIENT_KEY, JSON.stringify(alternate));
    await flushWorkspace();
    result = await pending;
  } finally {
    if (originalSelected == null) workspaceStorage.removeItem(SELECTED_CLIENT_KEY);
    else workspaceStorage.setItem(SELECTED_CLIENT_KEY, originalSelected);
    await flushWorkspace();
    window.fetch = originalFetch;
  }

  const passed = /cambiato progetto/i.test(result);
  return {
    status: passed ? "PASS" : "FAIL",
    area: "Cambio cliente durante operazione",
    detail: passed ? "Richiesta WordPress simulata annullata prima che il risultato possa essere usato." : `Esito inatteso: ${result}`,
  };
}

function checkUiBasics() {
  const duplicateIds = [...document.querySelectorAll("[id]")]
    .map((node) => node.id)
    .filter((id, index, all) => id && all.indexOf(id) !== index);
  const namelessButtons = [...document.querySelectorAll("button")].filter((button) => {
    const label = button.getAttribute("aria-label") || button.textContent || button.getAttribute("title") || "";
    return !label.trim();
  });
  const hasMain = Boolean(document.querySelector("main"));
  const hasNav = Boolean(document.querySelector("nav"));
  const passed = hasMain && hasNav && duplicateIds.length === 0 && namelessButtons.length === 0;
  return {
    status: passed ? "PASS" : "FAIL",
    area: "UI strutturale",
    detail: `main=${hasMain}; nav=${hasNav}; ID duplicati=${duplicateIds.length}; pulsanti senza nome=${namelessButtons.length}.`,
  };
}

export async function runMasterQa() {
  const results = [];
  const checks = [
    checkWorkspace,
    checkClientSelection,
    checkCorrectionIsolation,
    checkCredentialIsolation,
    checkProjectSwitchAbort,
    checkUiBasics,
  ];
  for (const check of checks) {
    try { results.push(await check()); }
    catch (error) {
      results.push({ status: "FAIL", area: check.name, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const area of MANUAL_MASTER_QA_CHECKS) {
    results.push({ status: "MANUAL", area, detail: "Richiede evidenza manuale/ambiente reale; il Master QA non simula un PASS." });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    origin: location.origin,
    results,
    summary: summarizeMasterQa(results),
  };
  window.__seogrowLastMasterQaReport = report;
  return report;
}

const style = `
#seogrow-master-qa { position:fixed; right:18px; bottom:18px; z-index:2147483000; width:min(520px,calc(100vw - 36px)); font:14px/1.35 system-ui,sans-serif; }
#seogrow-master-qa button { cursor:pointer; border:0; border-radius:10px; padding:10px 14px; font-weight:700; }
#seogrow-master-qa .launcher { float:right; background:#111827; color:white; box-shadow:0 8px 30px rgba(0,0,0,.22); }
#seogrow-master-qa .panel { clear:both; margin-top:10px; background:white; color:#111827; border:1px solid #d1d5db; border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,.22); max-height:72vh; overflow:auto; padding:14px; }
#seogrow-master-qa .row { padding:9px 0; border-bottom:1px solid #e5e7eb; }
#seogrow-master-qa .row:last-child { border-bottom:0; }
#seogrow-master-qa .PASS { color:#166534; } #seogrow-master-qa .FAIL { color:#b91c1c; } #seogrow-master-qa .MANUAL { color:#92400e; }
#seogrow-master-qa .actions { display:flex; gap:8px; margin-top:12px; } #seogrow-master-qa .secondary { background:#e5e7eb; color:#111827; }
`;

export function installMasterQaPanel() {
  if (document.getElementById("seogrow-master-qa")) return;
  const root = document.createElement("div");
  root.id = "seogrow-master-qa";
  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.textContent = "Esegui collaudo generale";
  root.append(launcher);
  document.body.append(root);
  const css = document.createElement("style");
  css.textContent = style;
  document.head.append(css);

  launcher.addEventListener("click", async () => {
    launcher.disabled = true;
    launcher.textContent = "Collaudo in corso…";
    root.querySelector(".panel")?.remove();
    try {
      const report = await runMasterQa();
      const panel = document.createElement("section");
      panel.className = "panel";
      panel.innerHTML = `<strong>Master QA: ${report.summary.overall}</strong><div>PASS ${report.summary.counts.PASS} · FAIL ${report.summary.counts.FAIL} · MANUAL ${report.summary.counts.MANUAL}</div>`;
      for (const item of report.results) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `<strong class="${item.status}">${item.status}</strong> — ${item.area}<br><small></small>`;
        row.querySelector("small").textContent = item.detail;
        panel.append(row);
      }
      const actions = document.createElement("div");
      actions.className = "actions";
      const copy = document.createElement("button");
      copy.className = "secondary";
      copy.textContent = "Copia report JSON";
      copy.addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify(report, null, 2)));
      const close = document.createElement("button");
      close.className = "secondary";
      close.textContent = "Chiudi";
      close.addEventListener("click", () => panel.remove());
      actions.append(copy, close);
      panel.append(actions);
      root.append(panel);
    } finally {
      launcher.disabled = false;
      launcher.textContent = "Esegui collaudo generale";
    }
  });
}
