import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "./api.js";
import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { navigatePage } from "./navigationUx.js";
import { loadProjectContinuity } from "./projectContinuity.js";
import { CheckCircle2, CircleGauge, Database, ListChecks, Pencil, Plug, Plus, Sparkles, Target } from "lucide-react";
import "./ProjectContinuityLayer.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};

const providerRequest = async (path) => {
  try {
    const response = await apiFetch(path);
    const data = await response.json();
    return response.ok && data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const projectId = () => Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
const integrationTone = (integration) => integration?.connected ? "ok" : integration?.configured ? "ready" : "pending";

const clickExisting = (selector) => {
  const control = document.querySelector(selector);
  if (!control) return false;
  control.click();
  return true;
};

const openClientEditor = (continuity) => {
  const cards = [...document.querySelectorAll(".reference-client-card")];
  const card = cards.find((candidate) => {
    const link = candidate.querySelector("a[href]")?.href || "";
    try { return new URL(link).href.replace(/\/$/, "") === new URL(continuity.site).href.replace(/\/$/, ""); }
    catch { return false; }
  });
  return Boolean(card?.querySelector('[data-client-action="edit"]')?.click());
};

function IntegrationBadge({ name, value, Icon }) {
  return (
    <div className={`project-continuity-integration ${integrationTone(value)}`}>
      <Icon aria-hidden="true" />
      <span><small>{name}</small><strong>{value?.label || "Da configurare"}</strong>{value?.detail && <em>{value.detail}</em>}</span>
    </div>
  );
}

const workCards = (continuity) => [
  {
    page: "Audit SEO",
    label: "Audit",
    value: continuity.work.audit.available ? `${continuity.work.audit.score ?? "—"}/100` : "Da eseguire",
    detail: `${continuity.work.audit.count} audit conservati`,
    Icon: CircleGauge,
  },
  {
    page: "Problemi",
    label: "Problemi",
    value: continuity.work.problems.active,
    detail: `${continuity.work.problems.resolved} risolti · ${continuity.work.problems.verify} da verificare`,
    Icon: Target,
  },
  {
    page: "Correzioni",
    label: "Correzioni",
    value: continuity.work.corrections.total,
    detail: `${continuity.work.corrections.verified} verificate`,
    Icon: CheckCircle2,
  },
  {
    page: "Task",
    label: "Task",
    value: continuity.work.tasks.active,
    detail: `${continuity.work.tasks.completed} completate`,
    Icon: ListChecks,
  },
  {
    page: "Posizionamenti",
    label: "Ranking",
    value: continuity.work.rankings.available ? continuity.work.rankings.keywords : "—",
    detail: continuity.work.rankings.available ? `${continuity.work.rankings.checks} controlli` : "Nessun controllo",
    Icon: Database,
  },
];

function CenterContinuity({ continuity }) {
  return (
    <section className="project-continuity-panel" aria-label="Stato completo del progetto">
      <header>
        <div><small>Contesto progetto unico</small><h2>Tutto il lavoro di {continuity.client.name}</h2><p>{continuity.site}</p></div>
        <button type="button" className="secondary" onClick={() => navigatePage("Integrazioni")}><Plug /> Gestisci integrazioni</button>
      </header>
      <div className="project-continuity-integrations">
        <IntegrationBadge name="WordPress" value={continuity.integrations.wordpress} Icon={Plug} />
        <IntegrationBadge name="Search Console" value={continuity.integrations.searchConsole} Icon={Database} />
        <IntegrationBadge name="DataForSEO" value={continuity.integrations.dataForSeo} Icon={Target} />
        <IntegrationBadge name="OpenAI" value={continuity.integrations.openAI} Icon={Sparkles} />
      </div>
      <div className="project-continuity-work">
        {workCards(continuity).map(({ page, label, value, detail, Icon }) => (
          <button type="button" key={page} onClick={() => navigatePage(page)}>
            <Icon aria-hidden="true" /><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span><b>Apri →</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function ClientActiveProject({ continuity }) {
  return (
    <section className="client-active-project" aria-label="Progetto cliente attivo">
      <div><small>Progetto attivo</small><strong>{continuity.client.name}</strong><span>{continuity.site}</span></div>
      <div className="client-active-project-status">
        <span className={integrationTone(continuity.integrations.wordpress)}>WordPress · {continuity.integrations.wordpress.connected ? "connesso" : continuity.integrations.wordpress.configured ? "configurato" : "da configurare"}</span>
        <span className={integrationTone(continuity.integrations.searchConsole)}>Search Console · {continuity.integrations.searchConsole.connected ? "collegata" : "da collegare"}</span>
        <span className={integrationTone(continuity.integrations.dataForSeo)}>DataForSEO · {continuity.integrations.dataForSeo.connected ? "disponibile" : "da configurare"}</span>
        <span className={integrationTone(continuity.integrations.openAI)}>OpenAI · {continuity.integrations.openAI.connected ? "disponibile" : "da configurare"}</span>
      </div>
      <div className="client-active-project-actions">
        <button type="button" className="primary" onClick={() => navigatePage("Centro progetto")}>Apri Centro progetto</button>
        <button type="button" className="secondary" onClick={() => navigatePage("Integrazioni")}><Plug /> Integrazioni</button>
        <button type="button" className="secondary" onClick={() => openClientEditor(continuity)}><Pencil /> Modifica cliente</button>
        <button type="button" className="secondary" onClick={() => clickExisting(".reference-clients-tools button.primary")}><Plus /> Nuovo cliente</button>
      </div>
    </section>
  );
}

export default function ProjectContinuityLayer() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [providerStatus, setProviderStatus] = useState({ dataForSeo: {}, openAI: {} });
  const [continuity, setContinuity] = useState(null);
  const [host, setHost] = useState(null);
  const activePage = ["Clienti", "Centro progetto"].includes(page);

  const refreshPage = useCallback(() => {
    setPage(currentPage());
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", refreshPage);
    window.addEventListener("popstate", refreshPage);
    window.addEventListener("seogrow-locationchange", refreshPage);
    window.addEventListener("seogrow-storage-ok", refreshPage);
    window.addEventListener("seogrow-remediation-history", refreshPage);
    window.addEventListener("storage", refreshPage);
    return () => {
      window.removeEventListener("hashchange", refreshPage);
      window.removeEventListener("popstate", refreshPage);
      window.removeEventListener("seogrow-locationchange", refreshPage);
      window.removeEventListener("seogrow-storage-ok", refreshPage);
      window.removeEventListener("seogrow-remediation-history", refreshPage);
      window.removeEventListener("storage", refreshPage);
    };
  }, [refreshPage]);

  useEffect(() => {
    if (!activePage) return undefined;
    let cancelled = false;
    Promise.all([providerRequest("/api/dataforseo/status"), providerRequest("/api/openai/status")])
      .then(([dataForSeo, openAI]) => { if (!cancelled) setProviderStatus({ dataForSeo, openAI }); });
    return () => { cancelled = true; };
  }, [activePage, page]);

  useEffect(() => {
    if (!activePage) return undefined;
    const clientId = projectId();
    if (!Number.isSafeInteger(clientId) || clientId <= 0) return undefined;
    let cancelled = false;
    loadProjectContinuity(clientId, providerStatus)
      .then((result) => { if (!cancelled) setContinuity(result); })
      .catch(() => { if (!cancelled) setContinuity(null); });
    return () => { cancelled = true; };
  }, [activePage, page, revision, providerStatus]);

  useEffect(() => {
    if (!activePage) return undefined;
    let frame = 0;
    let disposed = false;
    const find = () => {
      if (disposed) return;
      const main = document.querySelector(".app main");
      const anchor = page === "Clienti"
        ? document.querySelector(".reference-clients-head")
        : document.querySelector(".reference-project-identity");
      if (!main || !anchor) { frame = window.requestAnimationFrame(find); return; }
      let node = main.querySelector(':scope > [data-project-continuity-host="true"]');
      if (!node) {
        node = document.createElement("div");
        node.dataset.projectContinuityHost = "true";
        main.insertBefore(node, main.firstChild);
      }
      setHost(node);
    };
    find();
    return () => { disposed = true; window.cancelAnimationFrame(frame); };
  }, [activePage, page]);

  const selectedClientId = projectId();
  if (!activePage || !host || !continuity || continuity.clientId !== selectedClientId) return null;
  return createPortal(page === "Centro progetto" ? <CenterContinuity continuity={continuity} /> : <ClientActiveProject continuity={continuity} />, host);
}
