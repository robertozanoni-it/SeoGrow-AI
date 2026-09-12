import { apiFetch } from "./api.js";
import { applyJournaledCorrection } from "./correctionJournal.js";
import {
  removeVerifiedTask,
  setLastBatch,
  updateCorrection,
} from "./remediationStore.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import "./SharedElementorBrokenLinkUx.css";

const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const CLIENTS_KEY = "seogrow-clients";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const PRESERVE = "unlink-preserve-text";
const DELETE = "delete-anchor-text";
const previews = new Map();
const modes = new Map();
let frame = 0;

const readJson = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

const httpUrl = (value, { httpsOnly = false } = {}) => {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || (httpsOnly && url.protocol !== "https:") || url.username || url.password) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

const normalized = (value) => {
  const href = httpUrl(value);
  if (!href) return "";
  const url = new URL(href);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
};

const evidenceHref = (card, label) => {
  for (const row of card.querySelectorAll(".wp-live-link-evidence-field")) {
    if (!label.test(row.querySelector("span")?.textContent || "")) continue;
    return httpUrl(row.querySelector("a")?.getAttribute("href") || "");
  }
  return "";
};

const sourceUrl = (card) => evidenceHref(card, /pagina con il link/i) || httpUrl(card.querySelector(".wp-live-preview-title small")?.textContent || "", { httpsOnly: true });
const targetUrl = (card) => evidenceHref(card, /link da correggere/i);
const anchorText = (card) => {
  const value = String(card.querySelector(".wp-live-link-anchor")?.textContent || "").trim();
  return /rilevamento|senza testo|non rilevabile/i.test(value) ? "" : value;
};
const identity = (card) => `${normalized(sourceUrl(card))}|${normalized(targetUrl(card))}`;

const readCredentials = (card) => {
  const root = card.closest(".remediation-host")?.querySelector(".audit-unified-credentials");
  const inputs = [...(root?.querySelectorAll("input") || [])];
  return {
    url: inputs.find((input) => input.autocomplete === "url")?.value?.trim() || "",
    username: inputs.find((input) => input.autocomplete === "username")?.value?.trim() || "",
    applicationPassword: inputs.find((input) => input.type === "password")?.value || "",
  };
};

const issueTarget = (issue = {}) => httpUrl(issue.targetUrl || issue.brokenUrl || issue.destinationUrl || issue.href || "");
const auditTimestamp = (entry) => entry?.analyzedAt || entry?.startedAt || "";

const findAuditContext = (clientId, source, target) => {
  const pageStore = readJson(PAGE_HISTORY_KEY, {});
  const pageRows = pageStore?.[clientId] ?? pageStore?.[String(clientId)] ?? [];
  const siteStore = readJson(SITE_HISTORY_KEY, {});
  const siteRaw = siteStore?.[clientId] ?? siteStore?.[String(clientId)] ?? [];
  const siteRows = Array.isArray(siteRaw) ? siteRaw : siteRaw && typeof siteRaw === "object" ? [siteRaw] : [];
  const candidates = [
    ...(Array.isArray(pageRows) ? pageRows.map((item) => ({ type: "page", item })) : []),
    ...siteRows.map((item) => ({ type: "site", item })),
  ].filter(({ item }) => {
    const entrySource = normalized(item?.url || source);
    const sourceMatches = !item?.url || entrySource === normalized(source);
    return sourceMatches && (item?.issues || []).some((issue) => issueTarget(issue) === target);
  }).sort((a, b) => Date.parse(auditTimestamp(b.item) || 0) - Date.parse(auditTimestamp(a.item) || 0));
  const match = candidates[0];
  return {
    auditType: match?.type || "page",
    analyzedAt: auditTimestamp(match?.item) || "",
  };
};

const makeLink = (href, label = href) => {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
};

const setStatus = (section, text, kind = "") => {
  const node = section.querySelector(".seogrow-shared-link-status");
  if (!node) return;
  node.textContent = text;
  node.dataset.kind = kind;
};

const modeFor = (key) => modes.get(key) === DELETE ? DELETE : PRESERVE;

const syncModeButtons = (section, key) => {
  const mode = modeFor(key);
  for (const button of section.querySelectorAll("button[data-shared-link-mode]")) {
    const selected = button.dataset.sharedLinkMode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
  const warning = section.querySelector(".seogrow-shared-link-warning");
  if (warning) {
    warning.textContent = mode === DELETE
      ? "Verranno eliminati sia il link 404 sia l'anchor text. Controlla l'anteprima prima di applicare."
      : "Il link 404 verrà rimosso, mantenendo visibile l'anchor text.";
  }
};

const renderPreview = (section, card, preview) => {
  const key = identity(card);
  const container = section.querySelector(".seogrow-shared-link-preview");
  container.replaceChildren();
  const template = preview.sharedTemplate || preview.linkCleanup?.template || {};

  const heading = document.createElement("h5");
  heading.textContent = "Correzione automatica pronta";
  container.appendChild(heading);

  const facts = document.createElement("dl");
  const addFact = (label, value) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    facts.append(dt, dd);
  };
  addFact("Template Elementor", `${template.title || "Senza titolo"} (#${template.id || "?"} · ${template.type || "tipo non disponibile"})`);
  addFact("Anchor text", preview.linkCleanup?.anchorText || anchorText(card) || "Non disponibile");
  addFact("Azione", preview.linkCleanup?.action === DELETE ? "Elimina link e anchor text" : "Rimuovi il link e mantieni il testo");
  addFact("Impatto verificato", `${Number(preview.affectedUrls?.length || 0)} pagina/e pubbliche`);
  container.appendChild(facts);

  if (Array.isArray(preview.affectedUrls) && preview.affectedUrls.length) {
    const affected = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `Pagine influenzate (${preview.affectedUrls.length})`;
    const list = document.createElement("ul");
    for (const href of preview.affectedUrls) {
      const li = document.createElement("li");
      li.appendChild(makeLink(href));
      list.appendChild(li);
    }
    affected.append(summary, list);
    container.appendChild(affected);
  }

  const after = document.createElement("p");
  after.className = "seogrow-shared-link-after";
  after.innerHTML = preview.linkCleanup?.action === DELETE
    ? "<strong>Dopo:</strong> il collegamento e il testo associato non saranno più presenti nelle pagine influenzate."
    : "<strong>Dopo:</strong> il collegamento 404 sparirà, mentre l'anchor text resterà visibile.";
  container.appendChild(after);

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "danger seogrow-shared-link-apply";
  apply.textContent = "Applica correzione al template condiviso";
  apply.addEventListener("click", () => applyPreview(section, card, preview));
  container.appendChild(apply);
  container.hidden = false;
  previews.set(key, preview);
};

const preparePreview = async (section, card) => {
  const key = identity(card);
  const source = sourceUrl(card);
  const target = targetUrl(card);
  const credentials = readCredentials(card);
  if (!source || !target) {
    setStatus(section, "Pagina sorgente o link 404 non disponibili. Rileggi l'anchor text e riprova.", "error");
    return;
  }
  if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
    setStatus(section, "Connetti WordPress con URL, utente e password applicativa prima di preparare la correzione.", "error");
    return;
  }

  const button = section.querySelector(".seogrow-shared-link-prepare");
  if (button) button.disabled = true;
  previews.delete(key);
  section.querySelector(".seogrow-shared-link-preview")?.replaceChildren();
  setStatus(section, "Ricerca del template Elementor, verifica ownership e calcolo delle pagine influenzate…", "busy");
  try {
    const response = await apiFetch("/api/wordpress/elementor-shared-link-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteUrl: credentials.url,
        sourceUrl: source,
        targetUrl: target,
        username: credentials.username,
        applicationPassword: credentials.applicationPassword,
        mode: modeFor(key),
      }),
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      const error = new Error(data?.error || "Correzione del template condiviso non preparabile.");
      error.code = data?.code || "SHARED_LINK_PREVIEW_FAILED";
      throw error;
    }
    if (data.affectedPagesEnumerated !== true || data.completeSiteEnumeration !== true || !Array.isArray(data.affectedUrls)) {
      throw new Error("SeoGrow non ha attestato l'intero impatto pubblico del template: nessuna modifica autorizzata.");
    }
    renderPreview(section, card, data);
    setStatus(section, data.message || "Correzione automatica pronta. Controlla template, anchor text e pagine influenzate.", "ready");
  } catch (error) {
    setStatus(section, `Correzione automatica bloccata: ${error.message || error}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
};

const flattenSnapshot = (state) => ({
  "meta._elementor_data": state?.meta?._elementor_data ?? "",
});

const currentClient = () => {
  const id = Number(readJson(SELECTED_CLIENT_KEY, 0));
  const clients = readJson(CLIENTS_KEY, []);
  return {
    id,
    client: Array.isArray(clients) ? clients.find((item) => Number(item?.id) === id) || null : null,
  };
};

async function applyPreview(section, card, preview) {
  const key = identity(card);
  if (previews.get(key)?.approvalToken !== preview.approvalToken) {
    setStatus(section, "L'anteprima non è più attuale. Preparala di nuovo prima di applicare.", "error");
    return;
  }
  const credentials = readCredentials(card);
  const source = sourceUrl(card);
  const target = targetUrl(card);
  const anchor = preview.linkCleanup?.anchorText || anchorText(card) || "testo del collegamento";
  const affected = Array.isArray(preview.affectedUrls) ? preview.affectedUrls : [];
  const destructive = preview.linkCleanup?.action === DELETE;
  const accepted = window.confirm(
    `Applicare ORA la correzione al template Elementor condiviso?\n\nTemplate: ${preview.sharedTemplate?.title || "Senza titolo"} (#${preview.id})\nPagine pubbliche influenzate: ${affected.length}\nLink 404: ${target}\n${destructive ? `Anchor text che verrà ELIMINATO: «${anchor}»` : `Anchor text che verrà mantenuto: «${anchor}»`}\n\nSeoGrow verificherà tutte le pagine influenzate e ripristinerà automaticamente il template se il link resta visibile.`,
  );
  if (!accepted) return;

  const applyButton = section.querySelector(".seogrow-shared-link-apply");
  if (applyButton) applyButton.disabled = true;
  setStatus(section, "Scrittura atomica del template e riverifica di tutte le pagine influenzate…", "busy");
  try {
    const { id: clientId, client } = currentClient();
    if (!Number.isSafeInteger(clientId) || clientId <= 0) throw new Error("Seleziona il progetto corretto prima di applicare la modifica.");
    const audit = findAuditContext(clientId, source, target);
    const batchId = `shared-elementor-link-${Date.now()}`;
    setLastBatch(batchId);
    const before = flattenSnapshot(preview.previewBefore);
    const after = flattenSnapshot(preview.previewAfter);
    const record = {
      id: `correction-${crypto.randomUUID()}`,
      batchId,
      clientId,
      clientName: client?.name || "",
      platform: "wordpress",
      liveApproval: true,
      adapter: preview.adapter || "Elementor shared template link cleanup",
      issue: {
        type: "broken-external-link",
        label: card.querySelector(".wp-live-preview-title strong")?.textContent?.trim() || "Link esterno non raggiungibile (404)",
        sourceUrl: source,
        targetUrl: target,
        anchorText: anchor,
      },
      issueLabel: card.querySelector(".wp-live-preview-title strong")?.textContent?.trim() || "Link esterno non raggiungibile (404)",
      issueType: "broken-external-link",
      severity: "media",
      sourceUrl: source,
      siteUrl: credentials.url,
      finalUrl: source,
      resource: "elementor_library",
      entityId: Number(preview.id),
      wordpressResource: "elementor_library",
      wordpressId: Number(preview.id),
      username: credentials.username,
      fields: ["meta._elementor_data"],
      before,
      after,
      rollbackChanges: preview.previewBefore,
      status: "Da verificare",
      appliedAt: new Date().toISOString(),
      frontendConfirmed: false,
      auditType: audit.auditType,
      auditAnalyzedAt: audit.analyzedAt,
      brokenTargetUrl: target,
      cleanupMode: preview.linkCleanup?.action || PRESERVE,
      linkCleanup: preview.linkCleanup,
      sharedTemplate: preview.sharedTemplate,
      affectedUrls: affected,
      affectedPagesEnumerated: true,
      verificationNote: `Correzione condivisa pronta per ${affected.length} pagina/e. La scrittura e la verifica frontend devono entrambe riuscire prima della chiusura.`,
    };

    const saved = await applyJournaledCorrection(record, async () => {
      const response = await apiFetch("/api/wordpress/elementor-shared-link-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvalToken: preview.approvalToken,
          username: credentials.username,
          applicationPassword: credentials.applicationPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        const error = new Error(data?.error || "Applicazione shared Elementor non riuscita.");
        error.code = data?.code || "SHARED_LINK_APPLY_FAILED";
        throw error;
      }
      return {
        before: flattenSnapshot(data.before),
        after: flattenSnapshot(data.after),
        rollbackChanges: data.before,
        serverFrontendVerified: data.frontendVerified === true,
        affectedUrls: data.affectedUrls || affected,
      };
    });

    const verifiedAt = new Date().toISOString();
    const verified = await updateCorrection(saved.id, {
      status: "Verificato",
      frontendConfirmed: true,
      verifiedAt,
      lastVerificationAttemptAt: verifiedAt,
      frontendSnapshot: {
        brokenTargetUrl: target,
        occurrenceCount: 0,
        affectedUrls: affected,
      },
      verificationNote: `Template Elementor condiviso aggiornato. Link 404 assente nelle ${affected.length} pagina/e pubbliche enumerate e riverificate dal server.`,
    }) || saved;
    removeVerifiedTask(verified);
    previews.delete(key);
    window.dispatchEvent(new CustomEvent("seogrow-remediation-applied", {
      detail: {
        id: verified.id,
        batchId,
        sourceUrl: source,
        targetUrl: target,
        sharedTemplate: preview.sharedTemplate,
      },
    }));
    setStatus(section, `Correzione applicata e verificata su ${affected.length} pagina/e. Il link 404 non è più presente.`, "success");
    const container = section.querySelector(".seogrow-shared-link-preview");
    if (container) {
      const done = document.createElement("p");
      done.className = "seogrow-shared-link-success";
      done.textContent = "Verifica frontend completata. Il rollback resta disponibile nella sezione Correzioni.";
      container.replaceChildren(done);
    }
  } catch (error) {
    setStatus(section, `Applicazione non completata: ${error.message || error}`, "error");
  } finally {
    if (applyButton) applyButton.disabled = false;
  }
}

const createSection = (card) => {
  const key = identity(card);
  const section = document.createElement("section");
  section.className = "seogrow-shared-link-remediation";
  section.dataset.identity = key;

  const title = document.createElement("h4");
  title.textContent = "Correzione automatica del template Elementor";
  const intro = document.createElement("p");
  intro.textContent = "SeoGrow può individuare il template condiviso che genera questo link, calcolare tutte le pagine influenzate e preparare una modifica controllata con rollback automatico.";
  section.append(title, intro);

  const modesBox = document.createElement("div");
  modesBox.className = "seogrow-shared-link-modes";
  for (const [mode, label, className] of [
    [PRESERVE, "Rimuovi solo il link", "secondary"],
    [DELETE, "Elimina link + anchor text", "danger"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.sharedLinkMode = mode;
    button.textContent = label;
    button.addEventListener("click", () => {
      modes.set(key, mode);
      previews.delete(key);
      section.querySelector(".seogrow-shared-link-preview")?.replaceChildren();
      syncModeButtons(section, key);
      setStatus(section, "Modalità aggiornata. Prepara nuovamente la correzione.", "");
    });
    modesBox.appendChild(button);
  }
  section.appendChild(modesBox);

  const warning = document.createElement("p");
  warning.className = "seogrow-shared-link-warning";
  section.appendChild(warning);

  const prepare = document.createElement("button");
  prepare.type = "button";
  prepare.className = "primary seogrow-shared-link-prepare";
  prepare.textContent = "Analizza template e prepara correzione automatica";
  prepare.addEventListener("click", () => preparePreview(section, card));
  section.appendChild(prepare);

  const status = document.createElement("p");
  status.className = "seogrow-shared-link-status";
  status.setAttribute("role", "status");
  section.appendChild(status);

  const preview = document.createElement("div");
  preview.className = "seogrow-shared-link-preview";
  preview.hidden = true;
  section.appendChild(preview);

  syncModeButtons(section, key);
  return section;
};

export function annotateSharedElementorBrokenLinks() {
  if (typeof document === "undefined") return 0;
  let changed = 0;
  for (const card of document.querySelectorAll(".wp-live-preview-row.ownership_error")) {
    const title = card.querySelector(".wp-live-preview-title strong")?.textContent || "";
    const text = card.textContent || "";
    if (!/link esterno/i.test(title) || !/template condiviso|theme builder/i.test(text)) continue;
    const source = sourceUrl(card);
    const target = targetUrl(card);
    if (!source || !target) continue;
    const key = identity(card);
    const existing = card.querySelector(".seogrow-shared-link-remediation");
    if (existing?.dataset.identity === key) continue;
    existing?.remove();
    const section = createSection(card);
    const evidence = card.querySelector(".wp-live-link-evidence");
    if (evidence) evidence.insertAdjacentElement("afterend", section);
    else card.appendChild(section);
    changed += 1;
  }
  return changed;
}

const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    annotateSharedElementorBrokenLinks();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowSharedElementorBrokenLinkUxInstalled) {
  window.__seogrowSharedElementorBrokenLinkUxInstalled = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true, characterData: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-storage-ok"]) window.addEventListener(eventName, schedule);
}
