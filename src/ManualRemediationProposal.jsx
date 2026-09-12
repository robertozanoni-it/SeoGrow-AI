import { useState } from "react";
export default function ManualRemediationProposal({ item, kind, disabled, onPrepare }) {
  const [value, setValue] = useState(item.manualValue ?? (item.candidate || item.manualOriginal || ""));
  return <section className="manual-remediation-proposal" aria-label="Revisione della proposta">
    <h4>Rivedi o scrivi la proposta</h4>
    <p>La generazione non ha prodotto un testo applicabile. Puoi correggerlo qui: SeoGrow ricontrollerà qualità, campo WordPress e anteprima prima di chiedere l’approvazione. Questo pulsante non pubblica nulla.</p>
    <label><span>{kind === "content" ? "Contenuto completo del blocco selezionato, in HTML" : kind === "meta_description" ? "Meta description proposta (massimo 160 caratteri)" : "Testo proposto"}</span>
      <textarea rows={kind === "content" ? 12 : 5} value={value} onChange={event => setValue(event.target.value)} disabled={disabled} spellCheck aria-label="Testo della proposta da validare" />
    </label>
    <small>{Array.from(value.normalize("NFC")).length} caratteri · controlla frasi complete e informazioni presenti nella sorgente.</small>
    <button type="button" className="secondary" disabled={disabled || !value.trim()} onClick={() => onPrepare(value)}>Valida e prepara anteprima</button>
  </section>;
}
