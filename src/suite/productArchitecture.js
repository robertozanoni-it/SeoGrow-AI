const freezeList = (values) => Object.freeze(values.map((value) => String(value).trim()));

const defineProductModule = ({
  id,
  page,
  group,
  icon,
  inputs,
  outputs,
  data,
  primaryCta,
  owns,
  legacyViews = [],
  states,
}) => Object.freeze({
  id,
  page,
  label: page,
  group,
  icon,
  advancedOnly: false,
  inputs: freezeList(inputs),
  outputs: freezeList(outputs),
  data: freezeList(data),
  primaryCta: String(primaryCta).trim(),
  owns: freezeList(owns),
  legacyViews: freezeList(legacyViews),
  states: Object.freeze({
    empty: String(states.empty).trim(),
    error: String(states.error).trim(),
    completed: String(states.completed).trim(),
  }),
});

export const ARCHITECTURE_FROZEN = true;
export const ARCHITECTURE_VERSION = "2026-09-17";

const FROZEN_MODULE_ORDER = Object.freeze([
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
    group: "CONTROLLO",
    icon: "overview",
    inputs: ["progetto selezionato", "stato workspace"],
    outputs: ["sintesi salute progetto", "prossima azione utile"],
    data: ["clienti e progetti", "ultimo audit", "posizionamenti", "opportunità", "task", "stato integrazioni"],
    primaryCta: "Apri prossima azione",
    owns: ["project-overview", "next-action-routing"],
    states: {
      empty: "Nessun progetto selezionato: invita a scegliere o creare un cliente.",
      error: "Mostra quali dati di riepilogo non sono disponibili senza bloccare il resto della suite.",
      completed: "Mostra stato aggiornato, priorità e una sola prossima azione consigliata.",
    },
  }),
  defineProductModule({
    id: "clients",
    page: "Clienti",
    group: "CONTROLLO",
    icon: "clients",
    inputs: ["anagrafica cliente", "sito o progetto"],
    outputs: ["portfolio clienti", "progetto attivo"],
    data: ["clienti", "progetti", "URL associati", "stato configurazione progetto"],
    primaryCta: "Aggiungi cliente",
    owns: ["client-portfolio", "project-selection"],
    states: {
      empty: "Nessun cliente: mostra il percorso per aggiungere il primo cliente.",
      error: "Segnala il caricamento cliente fallito mantenendo disponibili gli altri record.",
      completed: "Cliente salvato e progetto selezionabile senza duplicare schede o workspace.",
    },
  }),
  defineProductModule({
    id: "project-center",
    page: "Centro progetto",
    group: "CONTROLLO",
    icon: "project",
    inputs: ["cliente selezionato", "sito selezionato", "obiettivi progetto"],
    outputs: ["configurazione progetto", "riepilogo operativo", "storico e report del progetto"],
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
    inputs: ["pagine del sito", "contenuti e link osservati"],
    outputs: ["mappa link interni", "raccomandazioni di collegamento", "evidenze anchor"],
    data: ["crawl pagine", "grafo link", "anchor text", "contenuti indicizzabili"],
    primaryCta: "Analizza link interni",
    owns: ["internal-link-analysis", "internal-link-recommendations"],
    states: {
      empty: "Nessun dato di linking: richiede un audit o dati pagina utilizzabili.",
      error: "Segnala dati incompleti senza inventare collegamenti.",
      completed: "Mostra opportunità di link con sorgente, destinazione e motivazione verificabile.",
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
    inputs: ["azione manuale", "problema", "opportunità"],
    outputs: ["task operativo", "stato avanzamento", "chiusura verificata"],
    data: ["task workspace", "clienti", "problemi", "opportunità", "stato completamento"],
    primaryCta: "Nuovo task",
    owns: ["task-management", "task-lifecycle"],
    states: {
      empty: "Nessun task attivo: consente di crearne uno o partire da un problema/opportunità.",
      error: "Segnala il record non leggibile senza duplicare il task.",
      completed: "Task chiuso e rimosso dalle viste attive, mantenendo lo storico necessario.",
    },
  }),
  defineProductModule({
    id: "editorial-plan",
    page: "Piano editoriale",
    group: "AZIONI",
    icon: "content",
    inputs: ["obiettivi", "keyword e opportunità", "contesto del sito"],
    outputs: ["piano editoriale", "brief contenuti", "priorità di pubblicazione"],
    data: ["opportunità", "ranking", "contenuti esistenti", "link interni", "regole editoriali"],
    primaryCta: "Genera piano editoriale",
    owns: ["editorial-planning", "content-briefs", "editorial-safety"],
    states: {
      empty: "Nessun piano: richiede obiettivi e dati minimi prima della generazione.",
      error: "Conserva il piano precedente e indica quale input impedisce la rigenerazione.",
      completed: "Piano salvato con priorità, brief e collegamenti ai dati che lo hanno generato.",
    },
  }),
  defineProductModule({
    id: "seo-agent",
    page: "SEO Agent",
    group: "AI",
    icon: "agent",
    inputs: ["obiettivo utente", "contesto progetto", "capability pubbliche dei moduli"],
    outputs: ["piano agentico", "azioni orchestrate", "run verificabile"],
    data: ["API pubbliche dei moduli", "workspace progetto", "OpenAI ufficiale", "storia run agentici"],
    primaryCta: "Chiedi a SEO Agent",
    owns: ["cross-module-orchestration", "agent-run-history"],
    legacyViews: ["SeoGrow AI"],
    states: {
      empty: "Nessun obiettivo: invita a descrivere il risultato desiderato.",
      error: "Mostra capability o step fallito senza sostituire la business logic del modulo proprietario.",
      completed: "Run concluso con piano, azioni eseguite/proposte e riferimenti ai moduli responsabili.",
    },
  }),
  defineProductModule({
    id: "geo-ai",
    page: "GEO AI",
    group: "AI",
    icon: "geo",
    inputs: ["sito", "contenuti", "entità e query rilevanti"],
    outputs: ["analisi GEO", "gap di answerability", "raccomandazioni GEO"],
    data: ["contenuti sito", "audit", "segnali strutturati disponibili", "OpenAI ufficiale"],
    primaryCta: "Avvia analisi GEO",
    owns: ["geo-analysis", "geo-recommendations"],
    states: {
      empty: "Nessuna analisi GEO: richiede un progetto con contenuti disponibili.",
      error: "Distingue dati sito mancanti da errore del provider AI.",
      completed: "Analisi salvata con score, gap e azioni tracciabili.",
    },
  }),
  defineProductModule({
    id: "integrations",
    page: "Integrazioni",
    group: "SISTEMA",
    icon: "integrations",
    inputs: ["configurazione connessione", "credenziali consentite"],
    outputs: ["stato connessioni", "diagnostica integrazioni"],
    data: ["OpenAI ufficiale", "DataForSEO", "WordPress", "Rank Math", "Elementor", "stato Google/Search Console supportato"],
    primaryCta: "Verifica integrazioni",
    owns: ["integration-configuration", "connection-health"],
    states: {
      empty: "Nessuna integrazione configurata: mostra solo le integrazioni supportate.",
      error: "Indica connessione e causa del fallimento senza esporre segreti persistenti.",
      completed: "Connessioni verificate con stato esplicito e nessun provider non supportato.",
    },
  }),
  defineProductModule({
    id: "settings",
    page: "Impostazioni",
    group: "SISTEMA",
    icon: "settings",
    inputs: ["preferenze suite", "policy locali", "operazioni backup/ripristino"],
    outputs: ["configurazione suite", "backup o ripristino validato"],
    data: ["preferenze UI", "policy sicurezza", "workspace esportabile", "configurazione non segreta"],
    primaryCta: "Salva impostazioni",
    owns: ["suite-preferences", "backup-restore", "security-settings"],
    states: {
      empty: "Usa valori predefiniti sicuri quando non esiste una configurazione salvata.",
      error: "Rifiuta configurazioni o backup non validi senza sovrascrivere lo stato corrente.",
      completed: "Impostazioni validate e persistite; backup/ripristino produce esito esplicito.",
    },
  }),
]);

export const CANONICAL_SUITE_PAGES = Object.freeze(PRODUCT_MODULES.map((moduleDefinition) => moduleDefinition.page));

export const LEGACY_VIEW_OWNERS = Object.freeze(Object.fromEntries(
  PRODUCT_MODULES.flatMap((moduleDefinition) =>
    moduleDefinition.legacyViews.map((legacyView) => [legacyView, moduleDefinition.page]),
  ),
));

export const productModuleForPage = (page) =>
  PRODUCT_MODULES.find((moduleDefinition) => moduleDefinition.page === page) || null;

export const canonicalPageForLegacyView = (page) => LEGACY_VIEW_OWNERS[page] || page;

export function validateFrozenProductArchitecture() {
  if (ARCHITECTURE_FROZEN !== true) throw new Error("L'architettura prodotto SeoGrow deve restare congelata.");
  if (PRODUCT_MODULES.length !== FROZEN_MODULE_ORDER.length) {
    throw new Error(`Numero moduli SeoGrow non valido: ${PRODUCT_MODULES.length}.`);
  }
  if (JSON.stringify(CANONICAL_SUITE_PAGES) !== JSON.stringify(FROZEN_MODULE_ORDER)) {
    throw new Error("Ordine o insieme dei moduli SeoGrow modificato mentre l'architettura è congelata.");
  }

  const ids = new Set();
  const pages = new Set();
  const ownership = new Map();
  const legacyViews = new Map();

  for (const moduleDefinition of PRODUCT_MODULES) {
    if (!moduleDefinition.id || ids.has(moduleDefinition.id)) throw new Error(`ID modulo prodotto duplicato: ${moduleDefinition.id}.`);
    if (!moduleDefinition.page || pages.has(moduleDefinition.page)) throw new Error(`Pagina prodotto duplicata: ${moduleDefinition.page}.`);
    ids.add(moduleDefinition.id);
    pages.add(moduleDefinition.page);

    for (const field of ["inputs", "outputs", "data", "owns"]) {
      if (!Array.isArray(moduleDefinition[field]) || moduleDefinition[field].length === 0) {
        throw new Error(`${moduleDefinition.page}.${field} deve essere definito.`);
      }
    }
    if (!moduleDefinition.primaryCta) throw new Error(`${moduleDefinition.page}.primaryCta deve essere definita.`);
    for (const stateName of ["empty", "error", "completed"]) {
      if (!moduleDefinition.states?.[stateName]) throw new Error(`${moduleDefinition.page}.states.${stateName} deve essere definito.`);
    }

    for (const capability of moduleDefinition.owns) {
      const owner = ownership.get(capability);
      if (owner) throw new Error(`Funzione prodotto sovrapposta: ${capability} (${owner}, ${moduleDefinition.page}).`);
      ownership.set(capability, moduleDefinition.page);
    }

    for (const legacyView of moduleDefinition.legacyViews) {
      if (pages.has(legacyView) || CANONICAL_SUITE_PAGES.includes(legacyView)) {
        throw new Error(`La vista legacy ${legacyView} non può essere un modulo canonico.`);
      }
      const owner = legacyViews.get(legacyView);
      if (owner) throw new Error(`Vista legacy duplicata: ${legacyView} (${owner}, ${moduleDefinition.page}).`);
      legacyViews.set(legacyView, moduleDefinition.page);
    }
  }

  return true;
}

validateFrozenProductArchitecture();
