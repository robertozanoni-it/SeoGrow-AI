import { getWordPressSession, rememberWordPressSession, forgetWordPressSession } from "./wordpressSession.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plug, XCircle } from "lucide-react";
import { apiFetch } from "./api";

const resolveTarget = () =>
  typeof document === "undefined"
    ? null
    : document.querySelector(".audit-unified-credentials");

const readCredentials = (target) => {
  const inputs = [...(target?.querySelectorAll("input") || [])];
  const url = inputs.find((input) => input.autocomplete === "url")?.value?.trim() || "";
  const username =
    inputs.find((input) => input.autocomplete === "username")?.value?.trim() || "";
  const applicationPassword =
    inputs.find((input) => input.type === "password")?.value || "";
  return { url, username, applicationPassword };
};

export default function WordPressConnectionControl({ clientId } = {}) {
  const activeClient = useCallback(() => clientId ?? JSON.parse(workspaceStorage.getItem("seogrow-selected-client-v1") || "null"), [clientId]);
  const busy = useRef(false);
  const generation = useRef(0);
  const [target, setTarget] = useState(() => resolveTarget());
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    const scan = () => {
      const next = resolveTarget();
      setTarget((current) => current === next ? current : next);
      if (!next && attempts < 120) {
        attempts += 1;
        frame = window.requestAnimationFrame(scan);
      }
    };
    scan();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!target) return undefined;
    const update = () => {
      const credentials = readCredentials(target);
      setReady(Boolean(credentials.url && credentials.username && credentials.applicationPassword));
      const session = getWordPressSession(activeClient(), credentials.url);
      const verified = session && session.username === credentials.username && session.applicationPassword === credentials.applicationPassword;
      setStatus(verified ? { state: "success", message: "WordPress collegato. Connessione verificata riutilizzata in questa sessione." } : { state: "idle", message: "Collegamento non verificato per queste credenziali. Premi Collega WordPress." });
    };
    const timer = window.setTimeout(update, 0);
    const changed = () => { generation.current += 1; forgetWordPressSession(activeClient(), readCredentials(target).url); update(); };
    target.addEventListener("input", changed);
    const expiry = window.setInterval(update, 30000);
    return () => {
      window.clearTimeout(timer);
      generation.current += 1;
      window.clearInterval(expiry);
      target.removeEventListener("input", changed);
    };
  }, [target, activeClient]);

  if (!target) return null;

  const connect = async () => {
    if (busy.current) return;
    const credentials = readCredentials(target);
    const requestedClient = activeClient();
    const version = generation.current;
    if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
      setStatus({
        state: "error",
        message: "Inserisci URL, utente e password applicativa WordPress.",
      });
      return;
    }

    busy.current = true;
    setConnecting(true);
    setStatus({ state: "loading", message: "Connessione a WordPress in corso…" });
    try {
      const response = await apiFetch("/api/wordpress/connection-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteUrl: credentials.url,
          username: credentials.username,
          applicationPassword: credentials.applicationPassword,
        }),
      });
      const data = await response.json();
      if (version !== generation.current || !target.isConnected || activeClient() !== requestedClient || JSON.stringify(readCredentials(target)) !== JSON.stringify(credentials)) return;
      if (!response.ok) throw new Error(data.error || "Connessione WordPress non riuscita.");
      rememberWordPressSession(requestedClient, { ...credentials, name: data?.user?.name });
      const name = data?.user?.name ? ` come ${data.user.name}` : "";
      const connector = data?.connector?.version ? ` · Connector ${data.connector.version}` : " · Connector non rilevato";
      setStatus({
        state: "success",
        message: `WordPress collegato${name}${connector}. Puoi preparare la proposta; ogni modifica richiede approvazione.`,
      });
    } catch (error) {
      if (version !== generation.current || !target.isConnected) return;
      forgetWordPressSession(requestedClient, credentials.url);
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Connessione WordPress non riuscita.",
      });
    } finally {
      busy.current = false;
      setConnecting(false);
    }
  };

  return createPortal(
    <div className="inline-actions wordpress-connection-control">
      <button
        type="button"
        className="primary"
        onClick={connect}
        disabled={!ready || connecting}
      >
        {status.state === "success" ? <Check /> : <Plug />}
        {connecting ? "Connessione…" : status.state === "success" ? "WordPress collegato" : "Collega WordPress"}
      </button>
      {status.message && (
        <span
          className={status.state === "error" ? "error" : "integration-result"}
          role={status.state === "error" ? "alert" : "status"}
        >
          {status.state === "error" && <XCircle aria-hidden="true" />} {status.message}
        </span>
      )}
    </div>,
    target,
  );
}
