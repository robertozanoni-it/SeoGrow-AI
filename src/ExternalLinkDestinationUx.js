import { apiFetch } from "./api.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const linkEvidenceCache = new Map();
let evidenceRequest = 0;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

const normalizedUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return String(value || "").trim();
  }
};

const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
};

const timestamp = (value) => Date.parse(value?.analyzedAt || value?.startedAt || 0) || 0;

const latestEntry = (value) => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return [...list].sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
};

const currentExternalIssues = () => {
  const clientId = Number(readJson(SELECTED_CLIENT_KEY, 0));
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return [];

  const siteStore = readJson(SITE_HISTORY_KEY, {});
  const pageStore = readJson(PAGE_HISTORY_KEY, {});
  const site = latestEntry(siteStore?.[clientId] ?? siteStore?.[String(clientId)]);
  const pageHistory = pageStore?.[clientId] ?? pageStore?.[String(clientId)] ?? [];

  const latestPages = new Map();
  for (const item of Array.isArray(pageHistory) ? pageHistory : []) {
    const key = normalizedUrl(item?.url || "");
    if (!key) continue;
    const previous = latestPages.get(key);
    if (!previous || timestamp(item) > timestamp(previous)) latestPages.set(key, item);
  }

  const entries = [site, ...latestPages.values()].filter(Boolean);
  const seen = new Set();
  const rows = [];
  for (const entry of entries) {
    for (const issue of Array.isArray(entry?.issues) ? entry.issues : []) {
      if (String(issue?.type || "").toLowerCase() !== "broken-external-link") continue;
      const sourceUrl = issue?.sourceUrl || issue?.url || entry?.url || "";
      const targetUrl = issue?.targetUrl || issue?.brokenUrl || issue?.destinationUrl || issue?.href || "";
      if (!sourceUrl || !targetUrl) continue;
      const row = {
        label: String(issue?.label || "Link esterno non raggiungibile").trim(),
        sourceUrl,
        targetUrl,
        anchorText: String(issue?.anchorText || issue?.linkText || issue?.anchor || "").trim(),
      };
      const identity = `${row.label}|${normalizedUrl(sourceUrl)}|${normalizedUrl(targetUrl)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      rows.push(row);
    }
  }
  return rows;
};

const groupedTargets = (issues) => {
  const grouped = new Map();
  for (const issue of issues) {
    const key = `${issue.label}|${normalizedUrl(issue.sourceUrl)}`;
    const values = grouped.get(key) || [];
    if (!values.some((item) => normalizedUrl(item.targetUrl) === normalizedUrl(issue.targetUrl))) values.push(issue);
    grouped.set(key, values);
  }
  return grouped;
};

const evidenceKey = (sourceUrl, targetUrl) => `${normalizedUrl(sourceUrl)}|${normalizedUrl(targetUrl)}`;

const readLinkEvidence = async (sourceUrl, targetUrl, { force = false } = {}) => {
  const source = safeHttpUrl(sourceUrl);
  const target = safeHttpUrl(targetUrl);
  if (!source || !target) return { anchorText: "", occurrenceCount: 0, error: "URL non valido." };
  const key = evidenceKey(source, target);
  if (force) linkEvidenceCache.delete(key);
  const cached = linkEvidenceCache.get(key);
  if (cached && Date.now() - cached.at < 15000) return cached.promise;

  const promise = apiFetch("/api/frontend/link-evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl: source, targetUrl: target }),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      return { anchorText: "", occurrenceCount: 0, error: data?.error || "Anchor text non verificabile." };
    }
    return data;
  }).catch((error) => ({
    anchorText: "",
    occurrenceCount: 0,
    error: error instanceof Error ? error.message : "Anchor text non verificabile.",
  }));

  linkEvidenceCache.set(key, { promise, at: Date.now() });
  return promise;
};

const makeExternalLink = (href, text, className = "") => {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  if (className) link.className = className;
  return link;
};

const createEvidenceField = (label, valueNode) => {
  const row = document.createElement("div");
  row.className = "wp-live-link-evidence-field";
  const heading = document.createElement("span");
  heading.textContent = label;
  row.appendChild(heading);
  row.appendChild(valueNode);
  return row;
};

const renderLiveEvidence = async (card, issue, { force = false } = {}) => {
  const identity = evidenceKey(issue.sourceUrl, issue.targetUrl);
  let block = card.querySelector(".wp-live-link-evidence");
  if (!block) {
    block = document.createElement("section");
    block.className = "wp-live-link-evidence";
    const explanation = card.querySelector(".correction-explanation");
    if (explanation) explanation.insertAdjacentElement("afterend", block);
    else card.appendChild(block);
  }
  if (!force && block.dataset.identity === identity && ["loading", "1"].includes(block.dataset.loaded)) return;
  block.dataset.identity = identity;
  block.dataset.loaded = "loading";
  const requestId = String(++evidenceRequest);
  block.dataset.requestId = requestId;
  block.replaceChildren();

  const title = document.createElement("h4");
  title.textContent = "Dove si trova il collegamento";
  block.appendChild(title);

  const sourceLink = makeExternalLink(issue.sourceUrl, issue.sourceUrl, "wp-live-link-url");
  block.appendChild(createEvidenceField("Pagina con il link", sourceLink));

  const anchorValue = document.createElement("strong");
  anchorValue.className = "wp-live-link-anchor";
  anchorValue.textContent = issue.anchorText || "Rilevamento anchor text…";
  block.appendChild(createEvidenceField("Anchor text", anchorValue));

  const targetLink = makeExternalLink(issue.targetUrl, issue.targetUrl, "wp-live-link-url");
  block.appendChild(createEvidenceField("Link da correggere", targetLink));

  const status = document.createElement("p");
  status.className = "wp-live-link-evidence-status";
  status.textContent = "Verifica frontend in corso…";
  block.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "wp-live-link-evidence-actions";
  actions.appendChild(makeExternalLink(issue.sourceUrl, "Apri pagina interessata", "secondary"));

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "secondary";
  refresh.textContent = "Rileggi anchor text";
  refresh.addEventListener("click", () => renderLiveEvidence(card, issue, { force: true }));
  actions.appendChild(refresh);

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "secondary";
  retry.textContent = "Riprova correzione";
  retry.addEventListener("click", () => {
    const remediation = card.closest(".wp-live-remediation");
    const prepareOne = remediation?.querySelector(".wp-live-remediation-actions button.secondary");
    prepareOne?.click();
  });
  actions.appendChild(retry);
  block.appendChild(actions);

  const evidence = await readLinkEvidence(issue.sourceUrl, issue.targetUrl, { force });
  if (!block.isConnected || block.dataset.identity !== identity || block.dataset.requestId !== requestId) return;
  const verifiedAnchor = String(evidence?.error ? issue.anchorText || "" : evidence?.anchorText || "").trim();
  anchorValue.textContent = verifiedAnchor || "Anchor senza testo o non rilevabile";
  const occurrences = Number(evidence?.occurrenceCount || 0);
  status.textContent = evidence?.error
    ? `Anchor text non verificabile automaticamente: ${evidence.error}`
    : evidence?.verificationSafe === false || evidence?.truncated === true ? "Verifica incompleta: non è possibile confermare l’assenza o correggere il link con questa lettura."
    : occurrences === 1
      ? "1 occorrenza verificata nel frontend della pagina."
      : occurrences > 1
        ? `${occurrences} occorrenze verificate: SeoGrow richiede una scelta esplicita prima di modificare.`
        : card.dataset.linkResolution === "absent-confirmed" ? "Link non più presente nelle sorgenti ricontrollate. Nessuna correzione necessaria: aggiorna l’audit." : "Nessuna occorrenza in questa lettura. Premi Prepara solo questo problema per verificare anche WordPress e aggiornare lo stato.";

  const text = card.textContent || "";
  if (card.dataset.linkResolution !== "absent-confirmed" && /template condiviso|ownership frontend non determinabile/i.test(text)) {
    const guide = document.createElement("p");
    guide.className = "wp-live-link-repair-guide";
    guide.innerHTML = "<strong>Correzione assistita:</strong> il collegamento sembra provenire da Elementor/Theme Builder condiviso. Apri la pagina o il template interessato, sostituisci o rimuovi questo URL, quindi usa <strong>Rileggi anchor text</strong> e <strong>Riprova correzione</strong>. SeoGrow non modifica automaticamente un template condiviso senza ownership certa.";
    block.insertBefore(guide, actions);
  }
  retry.hidden = card.dataset.linkResolution === "absent-confirmed";
  block.dataset.loaded = "1";
};

export function annotateExternalLinkDestinations() {
  if (typeof document === "undefined") return 0;
  const issues = currentExternalIssues();
  const grouped = groupedTargets(issues);
  if (!grouped.size) return 0;

  let changed = 0;
  const counters = new Map();
  for (const row of document.querySelectorAll(".problem-row")) {
    if (row.dataset.problemNavigation === "direct") continue;
    const main = row.querySelector(".problem-main");
    const label = main?.querySelector("strong")?.textContent?.trim() || "";
    if (!/link esterno/i.test(label)) continue;
    const sourceNode = [...(main?.querySelectorAll("small") || [])].find((node) => !node.classList.contains("problem-external-target"));
    const sourceUrl = sourceNode?.textContent?.trim() || "";
    const key = `${label}|${normalizedUrl(sourceUrl)}`;
    const targets = grouped.get(key) || [];
    if (!targets.length) continue;
    const offset = counters.get(key) || 0;
    const target = targets[Math.min(offset, targets.length - 1)]?.targetUrl || "";
    counters.set(key, offset + 1);
    let targetNode = main.querySelector(".problem-external-target");
    if (!targetNode) {
      targetNode = document.createElement("small");
      targetNode.className = "problem-external-target";
      main.appendChild(targetNode);
      changed += 1;
    }
    const text = `Link esterno: ${target}`;
    if (targetNode.textContent !== text) targetNode.textContent = text;
    targetNode.title = target;
  }

  const drawer = document.querySelector(".problem-drawer");
  const drawerTitle = drawer?.querySelector("#problem-dialog-title")?.textContent?.trim() || "";
  if (drawer && /link esterno/i.test(drawerTitle)) {
    const sourceUrl = drawer.querySelector(".problem-resource")?.getAttribute("href") || "";
    const targets = grouped.get(`${drawerTitle}|${normalizedUrl(sourceUrl)}`) || [];
    let block = drawer.querySelector(".problem-external-targets");
    if (targets.length) {
      if (!block) {
        block = document.createElement("section");
        block.className = "problem-external-targets";
        const resource = drawer.querySelector(".problem-resource");
        if (resource) resource.insertAdjacentElement("beforebegin", block);
        else drawer.appendChild(block);
        changed += 1;
      }
      block.replaceChildren();
      const heading = document.createElement("h3");
      heading.textContent = targets.length === 1 ? "Link esterno rilevato" : "Link esterni rilevati";
      block.appendChild(heading);
      for (const target of targets) block.appendChild(makeExternalLink(target.targetUrl, target.targetUrl));
    } else if (block) {
      block.remove();
      changed += 1;
    }
  }

  const liveCounters = new Map();
  for (const card of document.querySelectorAll(".wp-live-preview-row")) {
    const title = card.querySelector(".wp-live-preview-title strong")?.textContent?.trim() || "";
    if (!/link esterno/i.test(title)) continue;
    const sourceUrl = card.querySelector(".wp-live-preview-title small")?.textContent?.trim() || "";
    const key = `${title}|${normalizedUrl(sourceUrl)}`;
    const matches = grouped.get(key) || [];
    if (!matches.length) continue;
    const offset = liveCounters.get(key) || 0;
    const explicitTarget = safeHttpUrl(card.dataset.brokenTarget || "");
    const issue = explicitTarget ? matches.find(item => safeHttpUrl(item.targetUrl) === explicitTarget) : matches[Math.min(offset, matches.length - 1)];
    if (!issue) continue;
    liveCounters.set(key, offset + 1);
    void renderLiveEvidence(card, issue);
  }

  return changed;
}

let frame = 0;
const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    annotateExternalLinkDestinations();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowExternalLinkDestinationUxInstalled) {
  window.__seogrowExternalLinkDestinationUxInstalled = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-storage-ok"]) window.addEventListener(eventName, schedule);
}
