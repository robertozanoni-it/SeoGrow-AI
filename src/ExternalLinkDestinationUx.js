import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";

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
    if (!values.includes(issue.targetUrl)) values.push(issue.targetUrl);
    grouped.set(key, values);
  }
  return grouped;
};

export function annotateExternalLinkDestinations() {
  if (typeof document === "undefined") return 0;
  const grouped = groupedTargets(currentExternalIssues());
  if (!grouped.size) return 0;

  let changed = 0;
  const counters = new Map();
  for (const row of document.querySelectorAll(".problem-row")) {
    if (row.dataset.problemNavigation === "direct") continue; // React renders this row’s exact destination.
    const main = row.querySelector(".problem-main");
    const label = main?.querySelector("strong")?.textContent?.trim() || "";
    if (!/link esterno/i.test(label)) continue;
    const sourceNode = [...(main?.querySelectorAll("small") || [])].find((node) => !node.classList.contains("problem-external-target"));
    const sourceUrl = sourceNode?.textContent?.trim() || "";
    const key = `${label}|${normalizedUrl(sourceUrl)}`;
    const targets = grouped.get(key) || [];
    if (!targets.length) continue;
    const offset = counters.get(key) || 0;
    const target = targets[Math.min(offset, targets.length - 1)];
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
      for (const target of targets) {
        const link = document.createElement("a");
        link.href = target;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = target;
        block.appendChild(link);
      }
    } else if (block) {
      block.remove();
      changed += 1;
    }
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
