import { useEffect, useRef, useState } from "react";
import { savedViews } from "./productivity.js";

export function SavedViews({ views, filters, onApply, onSave, label }) {
  const [name, setName] = useState("");
  const items = savedViews(views);
  return <div className="feature-toolbar" aria-label={`Viste salvate ${label}`}>
    <label>Vista salvata<select value="" onChange={event => { const view = items.find(item => item.id === event.target.value); if (view) onApply(view.filters); }}><option value="">Scegli una vista…</option>{items.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    <label>Nome nuova vista<input maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label>
    <button className="secondary" disabled={!name.trim() || items.length >= 30} onClick={() => { onSave([...items, { id: crypto.randomUUID(), name: name.trim(), filters }]); setName(""); }}>Salva filtri</button>
    {items.length > 0 && <details><summary>Gestisci viste ({items.length}/30)</summary>{items.map(view => <p key={view.id}>{view.name} <button className="secondary" aria-label={`Elimina vista ${view.name}`} onClick={() => onSave(items.filter(item => item.id !== view.id))}>Elimina</button></p>)}</details>}
  </div>;
}

export function CommandPalette({ pages, onNavigate, onNewAudit }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    const shortcut = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !event.altKey) { if (!dialog.current?.open && document.querySelector('[role="dialog"], dialog[open]')) return; event.preventDefault(); setOpen(value => !value); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const commands = [...pages.map(page => ({ label: `Apri ${page}`, action: () => onNavigate(page) })), { label: "Prepara una nuova analisi", action: onNewAudit }];
  const matching = commands.filter(item => item.label.toLocaleLowerCase("it").includes(query.trim().toLocaleLowerCase("it")));
  return <><button className="secondary" onClick={() => { setQuery(""); setOpen(true); }}>Comandi <kbd>⌘ / Ctrl K</kbd></button><dialog className="command-dialog" ref={dialog} onCancel={() => setOpen(false)} aria-labelledby="command-title"><h2 id="command-title">Cosa vuoi fare?</h2><label>Cerca un comando<input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && matching[0]) { event.preventDefault(); setOpen(false); matching[0].action(); } }} /></label><p role="status">{matching.length} comandi disponibili</p><div className="command-results">{matching.map(item => <button className="secondary" key={item.label} onClick={() => { setOpen(false); item.action(); }}>{item.label}</button>)}</div><button className="secondary" onClick={() => setOpen(false)}>Chiudi</button></dialog></>;
}
