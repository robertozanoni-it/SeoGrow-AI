const REQUIRED_STATES = Object.freeze(["empty", "error", "completed"]);

const freezeArray = (items = []) => Object.freeze([...items]);
const freezeStates = (states = {}) => Object.freeze({ ...states });

const defineProductModule = (definition) => Object.freeze({
  ...definition,
  inputs: freezeArray(definition.inputs),
  outputs: freezeArray(definition.outputs),
  data: freezeArray(definition.data),
  owns: freezeArray(definition.owns),
  legacyViews: freezeArray(definition.legacyViews),
  states: freezeStates(definition.states),
});

export const FROZEN_SUITE_MODULES = Object.freeze([
  "Panoramica",
  "Clienti",
  "Centro progetto",
  "Audit SEO",
  "Posizionamenti",
  "Link interni",
  "Opportunità",
  "Correzioni",
  "Task",
  "Piano editoriale",
  "SEO Agent",
  "GEO AI",
  "Integrazioni",
  "Impostazioni",
]);

export const PRODUCT_MODULES = Object.freeze([
  defineProductModule({
    id: "overview",
    page: "Panoramica",
    group: "LAVORO",
    icon: "overview",
    inputs: ["progetto selezionato", "stato moduli"],
    outputs: ["sintesi salute progetto", "prossima azione utile"],
    data: ["clienti e progetti", "ultimo audit", "posizionamenti", "opportunità", "task", "stato integrazioni"],
    primaryCta: "Apri prossima azione",
    owns: ["project-overview", "next-best-action"],
    states: {
      empty: "Nessun progetto selezionato: mostra invito alla selezione o creazione cliente.",
      error: "Mantiene visibili i moduli disponibili e identifica il dato non leggibile.",
      completed: "Progetto attivo con sintesi e azione successiva derivata dai moduli.",
    },
  }),
  defineProductModule({
    id: "clients",
    page: "Clienti",
    group: "LAVORO",
    icon: "clients",
    inputs: ["anagrafica cliente", "URL progetto"],
    outputs: ["cliente/progetto persistito", "progetto selezionabile"],
    data: ["clienti", "associazione sito", "stato integrazioni"],
    primaryCta: "Nuovo cliente",
    owns: ["client-management", "project-selection"],
    states: {
      empty: "Nessun cliente: mostra creazione del primo progetto.",
      error: "Segnala dati cliente non validi senza alterare gli altri progetti.",
      completed: "Cliente salvato e selezionabile con contesto sito univoco.",
    },
  }),
  defineProductModule({
    id: "project-center",
    page: "Centro progetto",
    group: "LAVORO",
    icon: "project",
    inputs: ["cliente selezionato", "obiettivi e configurazione progetto"],
    outputs: ["baseline progetto", "configurazione operativa", "report progetto"],
    data: ["profilo progetto", "storico analisi", "configurazione report", "stato integrazioni", "attività progetto"],
    primaryCta: "Configura progetto",
    owns: ["project-configuration", "project-history", "project-reporting"],
    legacyViews: ["Storico"],
    states: {
      empty: "Nessun progetto attivo: richiede la selezione di un cliente.",
      error: "Mostra la sezione di configurazione che non può essere caricata e conserva i dati validi.",
      completed: "Configurazione coerente con storico e report accessibili nello stesso modulo.",
    },
  }),
  defineProductModule({
    id: "audit",
    page: "Audit SEO",
    group: "CRESCITA",
    icon: "audit",
    inputs: ["URL o sito", "perimetro audit"],
    outputs: ["risultato audit", "elenco problemi prioritizzato", "evidenze di verifica"],
    data: ["crawl osservato", "analisi salvate", "evidenze pagina", "chiusure problema", "stato correzioni in sola lettura"],
    primaryCta: "Avvia audit SEO",
    owns: ["audit-execution", "issue-detection", "issue-prioritization", "issue-verification-readonly"],
    legacyViews: ["Problemi"],
    states: {
      empty: "Nessun audit disponibile: mostra configurazione e avvio dell'analisi.",
      error: "Mostra il motivo del fallimento e conserva l'ultimo audit valido.",
      completed: "Audit concluso con problemi attivi, risolti e verificabili nello stesso modulo.",
    },
  }),
  defineProductModule({
    id: "rankings",
    page: "Posizionamenti",
    group: "CRESCITA",
    icon: "rankings",
    inputs: ["progetto", "query o keyword", "intervallo di analisi"],
    outputs: ["posizionamenti", "variazioni", "trend keyword"],
    data: ["DataForSEO", "dati Search Console supportati", "storico ranking"],
    primaryCta: "Aggiorna posizionamenti",
    owns: ["rank-tracking", "keyword-performance"],
    states: {
      empty: "Nessun dato ranking: invita a configurare la fonte dati o avviare il primo aggiornamento.",
      error: "Distingue errore provider, dati mancanti e intervallo non disponibile.",
      completed: "Ranking aggiornati con confronto precedente e variazioni leggibili.",
    },
  }),
  defineProductModule({
    id: "internal-links",
    page: "Link interni",
    group: "CRESCITA",
    icon: "links",
    inputs: ["pagine del sito", "contenuti e link osservati", "progetto WordPress collegato"],
    outputs: ["mappa link interni", "opportunità sorgente→destinazione", "anchor e motivazione", "preview e stato di verifica della correzione"],
    data: ["crawl pagine", "grafo link", "anchor text", "contenuti indicizzabili", "evidenza frontend", "stato Correzioni"],
    primaryCta: "Analizza link interni",
    owns: ["internal-link-analysis", "internal-link-recommendations", "internal-link-remediation-orchestration"],
    states: {
      empty: "Nessun dato di linking: richiede un audit o dati pagina utilizzabili.",
      error: "Blocca auto-link duplicati, self-link, ownership o anchor ambigue senza inventare collegamenti.",
      completed: "Mostra sorgente, destinazione, anchor e motivazione; preview/apply/verify usano il writer e il rollback canonici di Correzioni.",
    },
  }),
  defineProductModule({
    id: "opportunities",
    page: "Opportunità",
    group: "CRESCITA",
    icon: "opportunities",
    inputs: ["ranking", "audit", "dati di crescita disponibili"],
    outputs: ["opportunità ordinate", "priorità di crescita", "azioni candidate"],
    data: ["DataForSEO", "dati Search Console supportati", "audit", "contenuti", "task esistenti"],
    primaryCta: "Genera opportunità",
    owns: ["growth-opportunity-analysis", "opportunity-prioritization"],
    states: {
      empty: "Nessuna opportunità rilevata o dati insufficienti: spiega quale fonte manca.",
      error: "Mostra la fonte che ha impedito il calcolo e non crea task duplicati.",
      completed: "Opportunità deduplicate, ordinate e convertibili in task espliciti.",
    },
  }),
  defineProductModule({
    id: "corrections",
    page: "Correzioni",
    group: "AZIONI",
    icon: "fix",
    inputs: ["problema selezionato", "proposta di remediation", "approvazione utente"],
    outputs: ["anteprima prima/dopo", "correzione applicata o preparata", "verifica e ricevuta rollback"],
    data: ["problemi Audit SEO", "stato approvazioni", "WordPress", "Rank Math", "Elementor", "storia remediation"],
    primaryCta: "Correggi automaticamente",
    owns: ["remediation-proposal", "remediation-approval-flow", "wordpress-write-boundary", "remediation-verification-rollback"],
    states: {
      empty: "Nessuna correzione pronta: rimanda ai problemi attivi dell'Audit SEO.",
      error: "Blocca l'applicazione, conserva la proposta e mostra errore, prova e possibilità di rollback quando disponibile.",
      completed: "Correzione verificata con stato finale e ricevuta; il problema risolto non resta tra gli attivi.",
    },
  }),
  defineProductModule({
    id: "tasks",
    page: "Task",
    group: "AZIONI",
    icon: "tasks",
    inputs: ["azione verificata", "priorità", "scadenza", "assegnazione"],
    outputs: ["task persistita", "stato operativo", "completamento verificabile"],
    data: ["task progetto", "problemi", "opportunità", "contenuti", "correzioni"],
    primaryCta: "Nuova task",
    owns: ["task-management", "task-lifecycle"],
    states: {
      empty: "Nessuna task: invita a crearne una o a convertirla da un'azione verificata.",
      error: "Conserva le task valide e indica quale modifica non è stata salvata.",
      completed: "Task completata con evidenza o motivazione di chiusura.",
    },
  }),
  defineProductModule({
    id: "editorial",
    page: "Piano editoriale",
    group: "AZIONI",
    icon: "content",
    inputs: ["query e temi", "obiettivo editoriale", "calendario"],
    outputs: ["topical map", "brief", "bozza", "piano e calendario editoriale"],
    data: ["Search Console", "DataForSEO", "audit contenuti", "OpenAI", "bozze", "calendario"],
    primaryCta: "Crea contenuto",
    owns: ["content-planning", "content-generation", "editorial-calendar"],
    states: {
      empty: "Nessun piano: mostra fonti richieste e creazione del primo contenuto.",
      error: "Distingue errore dati da errore generazione e mantiene bozze già salvate.",
      completed: "Contenuto revisionabile con associazione a piano e calendario.",
    },
  }),
  defineProductModule({
    id: "agent",
    page: "SEO Agent",
    group: "INTELLIGENZA",
    icon: "agent",
    inputs: ["obiettivo utente", "contesto progetto", "permessi azioni"],
    outputs: ["piano agentico", "azioni orchestrate", "run verificabile"],
    data: ["API pubbliche dei moduli", "workspace progetto", "OpenAI ufficiale", "storia run agentici"],
    primaryCta: "Chiedi a SEO Agent",
    owns: ["cross-module-orchestration", "agent-run-history"],
    states: {
      empty: "Nessun run: invita a definire un obiettivo verificabile.",
      error: "Mostra step fallito e azioni non eseguite senza dichiarare successi non verificati.",
      completed: "Run concluso con passaggi, fonti, azioni e risultati tracciati.",
    },
  }),
  defineProductModule({
    id: "geo",
    page: "GEO AI",
    group: "INTELLIGENZA",
    icon: "geo",
    inputs: ["contenuti progetto", "entità", "query GEO"],
    outputs: ["segnali GEO", "gap", "priorità e strategie"],
    data: ["contenuti", "audit", "OpenAI", "DataForSEO supportato", "storia osservazioni"],
    primaryCta: "Analizza GEO",
    owns: ["geo-analysis", "geo-strategy"],
    states: {
      empty: "Dati insufficienti: indica contenuto o integrazione necessaria.",
      error: "Separa errore provider da assenza di evidenze GEO.",
      completed: "Analisi GEO salvata con segnali osservati e strategie distinguibili dalle ipotesi.",
    },
  }),
  defineProductModule({
    id: "integrations",
    page: "Integrazioni",
    group: "SISTEMA",
    icon: "integrations",
    inputs: ["credenziali e autorizzazioni", "progetto selezionato"],
    outputs: ["connessione verificata", "stato provider"],
    data: ["WordPress", "Search Console", "DataForSEO", "OpenAI", "sessioni verificate"],
    primaryCta: "Configura integrazione",
    owns: ["integration-configuration", "integration-health"],
    states: {
      empty: "Nessuna integrazione configurata: mostra provider disponibili e requisiti.",
      error: "Mostra test fallito senza memorizzare segreti non necessari.",
      completed: "Connessione verificata e riutilizzabile dal progetto secondo il suo perimetro.",
    },
  }),
  defineProductModule({
    id: "settings",
    page: "Impostazioni",
    group: "SISTEMA",
    icon: "settings",
    inputs: ["preferenze", "sicurezza", "backup"],
    outputs: ["preferenze persistite", "backup/ripristino", "stato workspace"],
    data: ["preferenze locali", "backup cifrati", "copie locali", "metadati workspace"],
    primaryCta: "Salva impostazioni",
    owns: ["app-preferences", "backup-restore", "workspace-maintenance"],
    states: {
      empty: "Usa valori di default sicuri e spiega le opzioni disponibili.",
      error: "Non perde le preferenze valide e segnala il campo o backup problematico.",
      completed: "Preferenze persistite e backup/ripristino disponibili.",
    },
  }),
]);

export function validateFrozenProductArchitecture() {
  const pages = PRODUCT_MODULES.map((moduleDefinition) => moduleDefinition.page);
  const duplicates = pages.filter((page, index) => pages.indexOf(page) !== index);
  const unknown = pages.filter((page) => !FROZEN_SUITE_MODULES.includes(page));
  const missing = FROZEN_SUITE_MODULES.filter((page) => !pages.includes(page));
  const ownerIndex = new Map();
  const ownershipConflicts = [];
  for (const moduleDefinition of PRODUCT_MODULES) {
    for (const capability of moduleDefinition.owns) {
      if (ownerIndex.has(capability)) ownershipConflicts.push({ capability, modules: [ownerIndex.get(capability), moduleDefinition.page] });
      else ownerIndex.set(capability, moduleDefinition.page);
    }
  }
  const incomplete = PRODUCT_MODULES.filter((moduleDefinition) =>
    !moduleDefinition.inputs.length ||
    !moduleDefinition.outputs.length ||
    !moduleDefinition.data.length ||
    !moduleDefinition.primaryCta ||
    REQUIRED_STATES.some((state) => !moduleDefinition.states?.[state]),
  );
  return {
    ok: !duplicates.length && !unknown.length && !missing.length && !ownershipConflicts.length && !incomplete.length,
    duplicates,
    unknown,
    missing,
    ownershipConflicts,
    incomplete: incomplete.map((item) => item.page),
    pages,
  };
}
