import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { apiFetch } from "./api.js";
import {
  buildProjectIntegrationRegistry,
  getWordPressSession,
  integrationStatusLabel,
  normalizeGoogleProperties,
  validateSingleProjectIntegrationConfig,
} from "./system/index.js";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const forClient = (store, clientId, fallback = null) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
const statusClass = (connection) => connection?.error ? "error" : connection?.connected ? "connected" : connection?.configured ? "configured" : "missing";

export default function IntegrationsWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [host, setHost] = useState(null);
  const [revision, setRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const [statusSnapshot, setStatusSnapshot] = useState({ openai: null, dataforseo: null, google: null, googleProperties: [], wordpress: null });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refreshPage = () => setPage(currentPage());
    const refreshData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "focus"]) window.addEventListener(event, refreshData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "focus"]) window.removeEventListener(event, refreshData);
    };
  }, []);

  useEffect(() => {
    if (page !== "Integrazioni") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "integrations-workspace-host guided-next-actions-host";
      mountedHost.dataset.integrationsIntegrityHost = "true";
      release = registerPageHost(page, mountedHost);
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    clients: readJson(WORKSPACE_KEYS.clients, []),
    selectedClient: Number(readJson(WORKSPACE_KEYS.selectedClient, 0)),
    gsc: readJson(WORKSPACE_KEYS.gsc, {}),
    wordpressProfiles: readJson(WORKSPACE_KEYS.wordpressProfiles, {}),
  }), [revision]);
  const client = stores.clients.find((item) => Number(item.id) === stores.selectedClient) || null;
  const wordpressProfile = forClient(stores.wordpressProfiles, stores.selectedClient, null);
  const wordpressSession = client ? getWordPressSession(client.id, wordpressProfile?.url || client.url) : null;
  const dataset = forClient(stores.gsc, stores.selectedClient, null);

  const registry = useMemo(() => buildProjectIntegrationRegistry({
    client,
    wordpressSession: statusSnapshot.wordpress || wordpressSession,
    wordpressProfile,
    openAiStatus: statusSnapshot.openai,
    dataForSeoStatus: statusSnapshot.dataforseo,
    googleStatus: statusSnapshot.google,
    googleProperties: statusSnapshot.googleProperties,
    dataset,
  }), [client, wordpressSession, wordpressProfile, statusSnapshot, dataset]);
  const gate = useMemo(() => validateSingleProjectIntegrationConfig(registry), [registry]);

  const checkAll = async () => {
    if (!client || checking) return;
    setChecking(true);
    setMessage("");
    const next = { openai: null, dataforseo: null, google: null, googleProperties: [], wordpress: wordpressSession };
    const errors = [];
    const getJson = async (path) => {
      const response = await apiFetch(path);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Verifica fallita: ${path}`);
      return data;
    };
    const checks = await Promise.allSettled([
      getJson("/api/openai/status"),
      getJson("/api/dataforseo/status"),
      getJson("/api/google/status"),
      getJson("/api/google/properties"),
    ]);
    const [openai, dataforseo, google, properties] = checks;
    if (openai.status === "fulfilled") next.openai = { ...openai.value, checkedAt: new Date().toISOString() }; else errors.push(`OpenAI: ${openai.reason?.message || "verifica non riuscita"}`);
    if (dataforseo.status === "fulfilled") next.dataforseo = { ...dataforseo.value, checkedAt: new Date().toISOString() }; else errors.push(`DataForSEO: ${dataforseo.reason?.message || "verifica non riuscita"}`);
    if (google.status === "fulfilled") next.google = { ...google.value, checkedAt: new Date().toISOString() }; else errors.push(`Search Console: ${google.reason?.message || "verifica non riuscita"}`);
    if (properties.status === "fulfilled") {
      try { next.googleProperties = normalizeGoogleProperties(properties.value?.properties || properties.value || []); }
      catch (error) { errors.push(`Search Console: ${error.message}`); }
    } else errors.push(`Search Console proprietà: ${properties.reason?.message || "verifica non riuscita"}`);

    if (wordpressSession) {
      try {
        const response = await apiFetch("/api/wordpress/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(wordpressSession),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Test WordPress non riuscito");
        next.wordpress = { ...wordpressSession, ...data, verifiedAt: new Date().toISOString() };
      } catch (error) { errors.push(`WordPress: ${error.message}`); next.wordpress = null; }
    }
    setStatusSnapshot(next);
    setMessage(errors.length ? errors.join(" · ") : "Verifica connessioni completata.");
    setChecking(false);
  };

  if (page !== "Integrazioni" || !host) return null;
  const content = !client ? (
    <section className="integrations-integrity-panel panel"><h2>Seleziona un progetto</h2><p>Le connessioni devono essere valutate nel contesto del progetto attivo.</p></section>
  ) : (
    <section className="integrations-integrity-panel panel" aria-label="Registro connessioni progetto">
      <div className="panel-head">
        <div><span className="eyebrow"><ShieldCheck /> Registro connessioni canonico</span><h2>Connessioni del progetto</h2><p>Una sola configurazione logica per progetto. I segreti restano nel runtime o nella sessione e non vengono duplicati nei moduli.</p></div>
        <button type="button" className="primary" disabled={checking} onClick={checkAll}><RefreshCw className={checking ? "spin" : ""} /> {checking ? "Verifica…" : "Verifica tutte"}</button>
      </div>
      {message && <p role={message.includes("fallita") || message.includes("non riuscita") ? "alert" : "status"}>{message}</p>}
      <div className="integration-canonical-grid">
        {registry.connections.map((connection) => <article key={connection.kind} className={`integration-canonical-card ${statusClass(connection)}`}>
          <div><Plug /><strong>{connection.label}</strong></div>
          <span>{connection.error ? <AlertTriangle /> : connection.connected ? <CheckCircle2 /> : <Plug />} {integrationStatusLabel(connection)}</span>
          <p>{connection.detail}</p>
          <small>{connection.scope === "project" ? "Configurazione progetto" : "Provider runtime condiviso"}{connection.identity ? ` · ${connection.identity}` : ""}</small>
          {connection.testedAt && <small>Ultima verifica: {new Date(connection.testedAt).toLocaleString("it-IT")}</small>}
        </article>)}
      </div>
      <footer className="integration-canonical-foot">
        <span>{gate.ok ? <CheckCircle2 /> : <AlertTriangle />} {gate.ok ? "Gate configurazione unica: PASS" : gate.errors.join(" · ")}</span>
        <span><ShieldCheck /> WordPress conserva la password applicativa solo nella sessione temporanea.</span>
      </footer>
    </section>
  );
  return createPortal(content, host);
}
