export function correctionPresentation(item) {
  if (item.status === 'preview') return { title: 'Proposta pronta da approvare', explanation: 'Controlla il testo attuale e quello proposto qui sotto.', next: 'Se la proposta ti va bene, premi “Applica questa modifica sul sito”.' };
  if (item.status === 'applied') return { title: 'Modifica applicata — da verificare', explanation: 'La scrittura è registrata; la risoluzione del problema SEO deve ancora essere verificata.', next: 'Apri Cronologia e ripristino per verificare il risultato.' };
  if (item.status === 'resolved') return { title: 'Problema già risolto', explanation: item.reason, next: 'Non è necessaria una nuova modifica.' };
  if (item.status === 'ownership_error') {
    const issue = `${item.issue?.type || ''} ${item.issue?.label || ''}`;
    const reason = String(item.reason || '').replace(/^Ownership frontend non determinabile per "[^"]+"\.\s*/, '').replace(/\s*Nessuna modifica è stata autorizzata\.$/, '');
    const next = /h1/i.test(issue)
      ? 'Apri la pagina e verifica in Elementor quali titoli sono H1 e da quale documento provengono. Dopo la correzione, esegui un nuovo audit.'
      : /content|contenuto|parole/i.test(issue)
        ? 'Apri la pagina in Elementor e individua il blocco di testo da arricchire con contenuti pertinenti. Dopo la revisione, esegui un nuovo audit.'
        : 'Apri la pagina per individuare il contenuto interessato. Serve una verifica mirata in Elementor prima di poter applicare questa correzione.';
    return { title: 'Modifica bloccata: nessuna proposta applicabile', explanation: reason || 'Il controllo non identifica con certezza il campo da modificare. Consulta la pagina in Elementor.', next };
  }
  if (item.status === 'auth_error') return { title: 'WordPress non ha autorizzato l’operazione', explanation: 'La connessione o i permessi non consentono questa operazione.', next: 'Controlla la connessione con “Collega WordPress” e i permessi dell’utente.' };
  return { title: 'Proposta non disponibile', explanation: 'La preparazione non è stata completata. Nessuna modifica è stata applicata da questa preparazione.', next: 'Consulta il dettaglio del controllo e riprova dopo aver risolto la causa.' };
}
export function readableCorrectionFields(item) {
  const labels = { title: 'Titolo', content: 'Contenuto della pagina', excerpt: 'Estratto', 'meta.rank_math_title': 'Titolo SEO', 'meta.rank_math_description': 'Meta description', 'meta._yoast_wpseo_title': 'Titolo SEO', 'meta._yoast_wpseo_metadesc': 'Meta description' };
  const value = (state, field) => {
    const raw = field.startsWith('meta.') ? state?.meta?.[field.slice(5)] : state?.[field];
    if (raw === '' || raw == null) return '(vuoto)';
    return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
  };
  return (item.data?.changed || []).map(field => ({ field, label: labels[field] || field, before: value(item.data.previewBefore, field), after: value(item.data.previewAfter, field) }));
}
