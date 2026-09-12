const brokenLinkTarget = (item) => item?.issue?.targetUrl || item?.issue?.brokenUrl || item?.issue?.destinationUrl || item?.issue?.href || '';
const withBrokenTarget = (item, text) => {
  const target = brokenLinkTarget(item);
  return target ? `${text} Link esatto da correggere: ${target}` : text;
};

export function correctionPresentation(item) {
  if (item.status === 'preview') return { title: 'Proposta pronta da approvare', explanation: withBrokenTarget(item, 'Controlla il testo attuale e quello proposto qui sotto.'), next: 'Se la proposta ti va bene, premi “Applica questa modifica sul sito”.' };
  if (item.status === 'applied') return { title: 'Modifica applicata — da verificare', explanation: withBrokenTarget(item, 'La scrittura è registrata; la risoluzione del problema SEO deve ancora essere verificata.'), next: 'Apri Cronologia e ripristino per verificare il risultato.' };
  if (item.status === 'resolved') return { title: 'Problema già risolto', explanation: withBrokenTarget(item, item.reason), next: 'Non è necessaria una nuova modifica.' };
  if (item.status === 'selection_required') return {
    title: 'Scegli il blocco Elementor da ampliare',
    explanation: item.reason || 'Più blocchi di testo locali sono stati verificati nel frontend. SeoGrow non sceglie arbitrariamente quale modificare.',
    next: 'Controlla le anteprime qui sotto e premi “Amplia questo blocco” sul contenuto corretto. Solo dopo verrà generata la proposta.',
  };
  if (item.status === 'ownership_error') {
    const issue = `${item.issue?.type || ''} ${item.issue?.label || ''}`;
    const reason = String(item.reason || '').replace(/^Ownership frontend non determinabile per "[^"]+"\.\s*/, '').replace(/\s*Nessuna modifica è stata autorizzata\.$/, '');
    if (/h1/i.test(issue)) return {
      title: 'Verifica origine H1 richiesta',
      explanation: reason || 'SeoGrow rileva H1 che possono provenire da documenti Elementor condivisi. Prima di modificare deve misurare l’impatto su tutte le URL attestate.',
      next: 'Premi “Verifica origine H1”. SeoGrow rifarà la coverage in sola lettura e preparerà la proposta soltanto se l’ownership è sicura.',
    };
    const next = /content|contenuto|parole/i.test(issue)
      ? 'Apri la pagina in Elementor e individua il blocco di testo da arricchire con contenuti pertinenti. Dopo la revisione, esegui un nuovo audit.'
      : 'Apri la pagina per individuare il contenuto interessato. Serve una verifica mirata in Elementor prima di poter applicare questa correzione.';
    return { title: 'Modifica bloccata: nessuna proposta applicabile', explanation: withBrokenTarget(item, reason || 'Il controllo non identifica con certezza il campo da modificare. Consulta la pagina in Elementor.'), next };
  }
  if (item.status === 'auth_error') return { title: 'WordPress non ha autorizzato l’operazione', explanation: withBrokenTarget(item, item.reason || 'La connessione o i permessi non consentono questa operazione.'), next: 'Controlla la connessione con “Collega WordPress” e i permessi dell’utente.' };
  if (item.status === 'quality_error') return {
    title: 'Proposta respinta dal controllo qualità',
    explanation: withBrokenTarget(item, item.reason || 'La proposta generata non ha superato i controlli editoriali di SeoGrow; nessuna modifica è stata applicata.'),
    next: 'Usa “Rivedi o scrivi la proposta”: correggi il testo, poi premi “Valida e prepara anteprima”. I controlli qualità restano obbligatori.',
  };
  if (item.status === 'context_error') return {
    title: 'Contesto SEO da confermare',
    explanation: withBrokenTarget(item, item.reason || 'Mancano informazioni sufficienti per preparare questa correzione in sicurezza.'),
    next: 'Controlla il dettaglio tecnico e conferma il contesto richiesto prima di riprovare.',
  };
  if (item.status === 'adapter_error') return {
    title: 'Campo WordPress non scrivibile automaticamente',
    explanation: withBrokenTarget(item, item.reason || 'SeoGrow non trova un campo WordPress/SEO esposto in modo sicuro per questa modifica.'),
    next: /broken-external-link|link esterno/i.test(`${item.issue?.type || ''} ${item.issue?.label || ''}`)
      ? 'Aggiorna o reinstalla SeoGrow Connector, poi prepara di nuovo questa proposta. Il link esterno viene gestito dal contenuto Elementor/WordPress, non da Rank Math o Yoast.'
      : 'Controlla Rank Math/Yoast e il Connector, quindi riprova la preparazione.',
  };
  if (item.status === 'timeout_error') return {
    title: 'Controllo scaduto prima di completarsi',
    explanation: withBrokenTarget(item, item.reason || 'La lettura necessaria alla proposta non si è conclusa entro il tempo massimo.'),
    next: 'Riprova la preparazione. Se si ripete, controlla raggiungibilità e tempi di risposta del sito.',
  };
  if (item.status === 'generation_error' && /openai.*non (?:è )?configurat|OPENAI_API_KEY/i.test(String(item.reason || ''))) return {
    title: 'Configurazione OpenAI mancante',
    explanation: 'WordPress è collegato, ma questa installazione di SeoGrow non vede ancora la configurazione OpenAI necessaria per generare la proposta.',
    next: 'Premi “Configura OpenAI” oppure riavvia la preview: SeoGrow prova a riutilizzare in memoria la configurazione della installazione principale senza copiarne la chiave.',
  };
  if (item.status === 'generation_error') return { title: 'Generazione proposta non completata', explanation: withBrokenTarget(item, item.reason || 'La connessione WordPress è disponibile, ma il motore di generazione non ha prodotto una proposta valida.'), next: 'Controlla la causa oppure usa il campo di revisione per scrivere una proposta e validarla, senza pubblicazione automatica.' };
  if (item.status === 'stale') return {
    title: 'Anteprima scaduta — prepara di nuovo',
    explanation: withBrokenTarget(item, item.reason || 'Il progetto, l’audit o il contenuto WordPress sono cambiati dopo la preparazione. SeoGrow ha invalidato la proposta per evitare una sovrascrittura.'),
    next: 'Prepara nuovamente questo problema e confronta il nuovo Prima/Dopo prima di applicarlo.',
  };
  if (item.status === 'error' && /ATOMIC_WRITE_UNAVAILABLE|confronto e aggiornamento atomici non garantiti|singola riga postmeta|postmeta/i.test(String(item.reason || ''))) return {
    title: 'Applicazione bloccata dal Connector WordPress',
    explanation: withBrokenTarget(item, item.reason || 'La proposta è stata preparata, ma il Connector non può garantire una scrittura atomica e reversibile per questo campo.'),
    next: /broken-external-link|link esterno/i.test(`${item.issue?.type || ''} ${item.issue?.label || ''}`)
      ? 'Installa la versione aggiornata di SeoGrow Connector, prepara di nuovo l’anteprima e riprova. Il nuovo writer gestisce atomicamente la rimozione di un singolo link esterno in Elementor.'
      : 'Aggiorna o reinstalla SeoGrow Connector, prepara di nuovo l’anteprima e riprova. Se il blocco resta, il campo non espone una singola riga postmeta verificabile e la modifica resta manuale.',
  };
  if (item.status === 'error') return {
    title: 'Applicazione non completata',
    explanation: withBrokenTarget(item, item.reason || 'La proposta era stata preparata, ma WordPress non ha confermato la scrittura. SeoGrow non considera il problema risolto.'),
    next: 'Controlla la causa, prepara una nuova anteprima e applica soltanto dopo aver verificato nuovamente il Prima/Dopo.',
  };
  return { title: 'Proposta non disponibile', explanation: withBrokenTarget(item, item.reason || 'La preparazione non è stata completata. Nessuna modifica è stata applicata da questa preparazione.'), next: 'Consulta la causa indicata e riprova dopo averla risolta.' };
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
