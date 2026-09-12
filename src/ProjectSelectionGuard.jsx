import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Users } from "lucide-react";
import { navigatePage } from "./navigationUx.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import "./ProjectSelectionGuard.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const SAFE_WITHOUT_PROJECT = new Set(["Clienti", "Impostazioni"]);

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};

const snapshot = () => {
  const clients = readJson(CLIENTS_KEY, []);
  const selectedId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
  const selectedExists = Array.isArray(clients) && clients.some((client) => normalizeClientId(client?.id) === selectedId);
  return {
    page: currentPage(),
    clients: Array.isArray(clients) ? clients : [],
    selectedId,
    valid: Boolean(selectedId && selectedExists),
  };
};

export default function ProjectSelectionGuard() {
  const [state, setState] = useState(snapshot);
  const [host, setHost] = useState(null);

  useEffect(() => {
    const refresh = () => setState(snapshot());
    const storage = (event) => {
      const key = event?.key || event?.detail?.key;
      if (!key || [CLIENTS_KEY, SELECTED_CLIENT_KEY].includes(key)) refresh();
    };
    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-storage-ok", storage);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", storage);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const blocked = !state.valid && !SAFE_WITHOUT_PROJECT.has(state.page);

  useEffect(() => {
    if (!blocked) return undefined;
    let cancelled = false;
    let frame = 0;
    let mountedHost = null;
    const install = () => {
      if (cancelled) return;
      const workspace = document.querySelector(".workspace");
      if (!workspace) {
        frame = window.requestAnimationFrame(install);
        return;
      }
      mountedHost = document.createElement("div");
      mountedHost.className = "project-selection-guard-host";
      workspace.appendChild(mountedHost);
      setHost(mountedHost);
      document.body.dataset.seogrowProjectSelectionBlocked = "true";
    };
    frame = window.requestAnimationFrame(install);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      mountedHost?.remove();
      delete document.body.dataset.seogrowProjectSelectionBlocked;
    };
  }, [blocked]);

  if (!blocked || !host?.isConnected) return null;

  return createPortal(
    <section className="project-selection-guard" role="alert" aria-labelledby="project-selection-guard-title">
      <AlertTriangle />
      <div>
        <small>Contesto progetto non valido</small>
        <h1 id="project-selection-guard-title">Seleziona il progetto prima di continuare</h1>
        <p>
          SeoGrow non mostra dati di un altro cliente come fallback. Il progetto salvato non esiste più,
          non è valido oppure non è stato ancora selezionato.
        </p>
        <button type="button" className="primary" onClick={() => navigatePage("Clienti")}><Users /> Apri Clienti</button>
      </div>
    </section>,
    host,
  );
}
