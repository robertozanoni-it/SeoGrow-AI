import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, PlugZap } from "lucide-react";
import { buildConnectorArchive } from "./connectorPackage.js";
const connectorModules = import.meta.glob("../wordpress-plugin/seogrow-connector/*.{php,inc}", { query: "?raw", import: "default" });
import "./WordPressConnectorControl.css";

const resolveTarget = () =>
  typeof document === "undefined" ? null : document.querySelector(".wp-live-remediation");

export default function WordPressConnectorControl() {
  const [target, setTarget] = useState(() => resolveTarget());
  const [packaging, setPackaging] = useState(false);
  const [message, setMessage] = useState("");

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

  if (!target) return null;

  const downloadConnector = async () => {
    setPackaging(true);
    setMessage("Preparazione Connector…");
    try {
      const { bytes, version, fileCount } = await buildConnectorArchive(connectorModules);
      const blob = new Blob([bytes], { type: "application/zip" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `seogrow-connector-${version}-completo.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setMessage(`Connector ${version} pronto: ${fileCount} moduli verificati, scrittura atomica inclusa. Installa lo ZIP completo soltanto se il Connector manca o deve essere aggiornato, poi riconnetti WordPress.`);
    } catch (error) {
      setMessage(`Preparazione Connector non riuscita: ${error.message}`);
    } finally {
      setPackaging(false);
    }
  };

  return createPortal(
    <section className="wp-connector-control" aria-label="SeoGrow Connector per WordPress">
      <div>
        <span className="wp-connector-kicker"><PlugZap /> Adapter Elementor e SEO</span>
        <strong>SeoGrow Connector — informazioni sul collegamento</strong>
        <small>
          Questo riquadro non segnala un errore. Il Connector abilita i campi Elementor e SEO e i controlli di scrittura atomica. Lo stato della connessione è nel pulsante “Collega WordPress”; eventuali impedimenti sono indicati nella singola proposta. Il download contiene tutti i moduli necessari, non soltanto il file principale.
        </small>
      </div>
      <button type="button" className="secondary" onClick={downloadConnector} disabled={packaging}>
        <Download />{packaging ? "Preparazione…" : "Scarica SeoGrow Connector"}
      </button>
      {message && <p role="status" className="integration-result wp-connector-message">{message}</p>}
    </section>,
    target,
  );
}
