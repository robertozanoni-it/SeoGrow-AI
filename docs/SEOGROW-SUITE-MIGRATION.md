# SeoGrow AI → SeoGrow Suite

Baseline iniziale: `main@2c4a8eef7b17d316726f5709bdffeaba46256726`  
Foundation consolidata fino a: `main@bbe4d22918c6d6501d6026f725732d9ba25e39ec`

## Obiettivo

Trasformare SeoGrow AI da applicazione monolitica a **modular monolith** estensibile, senza ricostruire il prodotto, senza perdere dati e senza cambiare prematuramente i flussi WordPress già verificati.

Architettura attuale:

```text
SeoGrow Suite
├── Experience
│   ├── Hub
│   └── Tasks
├── Modules
│   ├── Audit
│   ├── Rank & Growth
│   ├── Content
│   ├── Links
│   ├── GEO
│   └── Publish
├── Intelligence
│   └── SeoGrow Agent
├── Core
│   ├── Module Contract / Registry
│   ├── Capability Registry
│   ├── Workspace Registry / Views
│   ├── Clients / Sites
│   ├── Tasks / Actions
│   └── History / Approvals
└── Integrations
    ├── OpenAI
    ├── DataForSEO
    └── WordPress / Rank Math / Elementor
```

## Invarianti di migrazione

1. Nessuna riscrittura da zero.
2. Nessuna cancellazione o reset del workspace esistente.
3. Le chiavi persistite `seogrow-*` restano compatibili finché una migrazione versionata non dimostra il contrario.
4. Il database IndexedDB esistente resta condiviso: i moduli usano viste logiche, non copie dei dati.
5. Le route/hash legacy restano valide durante il refactor.
6. WordPress, Rank Math, Elementor, remediation, approvals e verification non vengono spostati in blocco.
7. Ogni estrazione di dominio mantiene i test correnti e aggiunge regression guard sul nuovo confine.
8. `main` riceve solo checkpoint con Release Gate e Connector Package verdi.
9. L'Agent orchestra capability dichiarate; non deve duplicare business logic di dominio.
10. Un modulo può essere attivo nell'interfaccia senza essere automaticamente invocabile dall'Agent.

## Ownership attuale delle route legacy

| Pagina corrente | Modulo owner |
| --- | --- |
| Panoramica, Clienti, Centro progetto, Storico, SeoGrow AI | Hub |
| Audit SEO, Problemi | Audit |
| Posizionamenti, Opportunità | Rank & Growth |
| Piano editoriale | Content |
| Link interni | Links |
| GEO AI | GEO |
| Correzioni | Publish |
| Task | Tasks |
| SEO Agent | Agent |
| Integrazioni, Impostazioni | System |

La UI della Suite presenta nomi più semplici senza riscrivere le route salvate:

```text
Overview       → Panoramica
Audit          → Audit SEO
Rankings       → Posizionamenti
Content        → Piano editoriale
Links          → Link interni
GEO            → GEO AI
Publish        → Correzioni
SeoGrow Agent  → SEO Agent
```

## Module Contract

Ogni modulo dichiara almeno:

- `id`;
- `label`;
- `layer`;
- `status`;
- `agentEnabled`;
- `homePage`;
- `futurePath`;
- `pages`;
- `capabilities`.

Il Core rifiuta ID, future path e ownership pagina duplicati.

`agentEnabled` è separato da `status`: un modulo può essere disponibile all'utente ma non utilizzabile dall'orchestratore.

### Stato Agent

Attualmente sono agent-enabled:

- Audit;
- Rank & Growth;
- Content;
- Links;
- GEO.

`Publish` è **active** ma `agentEnabled: false`.

Questa separazione impedisce che l'attivazione della UI Publish abiliti implicitamente scritture autonome su WordPress.

## Capability Registry

Le capability sono namespaced per modulo, per esempio:

```text
audit:detect
audit:verify
rank:rankings
rank:search-opportunities
content:content-optimization
links:internal-links
geo:answerability
publish:preview
publish:wordpress
publish:verify
```

Il catalogo Agent usa solo capability appartenenti a moduli esplicitamente `agentEnabled`.

## Compatibilità Agent

Il runtime Agent conserva temporaneamente i tool ID legacy per non rompere run, planner, approvals e QA già esistenti.

Mapping attuale:

```text
data.gsc           → rank:growth-signals
data.analysis      → audit:detect
data.rankings      → rank:rankings
seo.opportunities  → rank:search-opportunities
seo.trafficDrop    → rank:growth-signals
seo.contentDecay   → content:content-optimization
seo.internalLinks  → links:internal-links
```

Un regression guard assicura che ogni tool registrato nel runtime legacy disponga di una capability Suite corrispondente.

## Workspace Core

Le chiavi persistite esistenti sono centralizzate in `src/core/workspace/storageKeys.js` senza cambiarne i valori.

Sono già registrati, tra gli altri:

- clienti e selezione progetto;
- task;
- Search Console e storico GSC;
- analisi e audit;
- rankings;
- topical map;
- GEO;
- content drafts;
- profili WordPress;
- CMS router;
- run Agent e approval ledger;
- remediation history;
- snapshots e preferenze.

`src/core/workspace/moduleWorkspaceViews.js` definisce viste logiche sopra lo stesso workspace.

### Separazione Audit / Publish

Audit vede evidenza tecnica, risultati audit e storico remediation necessario alla verifica.

Publish possiede il contratto dati operativo per:

- profili WordPress;
- CMS router;
- page audit evidence necessaria all'applicazione/verifica;
- remediation history;
- ultimo batch remediation.

Nessun dataset è stato duplicato o migrato.

## Publish

Publish è ora un modulo reale della Suite.

Route visibile:

```text
Publish → #Correzioni
```

La route legacy resta invariata.

Il modulo dispone di due boundary pubblici:

```text
src/modules/publish/index.js
```

per i servizi WordPress/remediation e:

```text
src/modules/publish/ui.js
```

per le superfici UI:

- `AutomaticProposalPage`;
- `RemediationRuntime`;
- `CorrectionsWorkspace`.

Le implementazioni fisiche restano temporaneamente nei percorsi legacy per evitare uno spostamento massivo non necessario.

Il motore WordPress, Rank Math, Elementor, approval flow e verify non sono stati modificati dall'attivazione di Publish.

## Audit

Audit possiede ora:

- Audit SEO;
- Problemi;
- rilevazione;
- prioritizzazione;
- verifica.

Le superfici di applicazione/remediation non sono più esportate dalla facade Audit.

Il flusso di prodotto diventa quindi:

```text
Audit
Detect → Prioritize
          ↓
       Publish
Proposal → Approval → Preview → Apply
          ↓
        Audit
        Verify
```

## Navigazione Suite

La sidebar semplice è organizzata come:

```text
Overview

GROW
Audit
Rankings
Content
Links
GEO

ACT
Publish
Tasks

AI
SeoGrow Agent

SYSTEM
Integrations
Settings
```

Pagine tecniche come Problemi, Opportunità, Centro progetto e Storico rimangono disponibili in modalità avanzata o quando necessarie al workflow.

## Checkpoint completati

### Fase 1 — Foundation

- [x] Module Contract;
- [x] manifest per dominio;
- [x] registry centrale;
- [x] route compatibility;
- [x] storage key registry;
- [x] sidebar Suite;
- [x] wizard collegato al registry;
- [x] facade Audit iniziale;
- [x] Release Gate + Connector Package verdi.

Merged: `f974690f4e7eb5aac389c978618e3fb6433792a9`

### Fase 2 — Publish / capability boundaries

- [x] facade servizi Publish;
- [x] capability namespaced;
- [x] catalogo capability Agent;
- [x] registry completo degli store esistenti;
- [x] restore collegato al Core;
- [x] dependency guard WordPress;
- [x] Release Gate + Connector Package + macOS verdi.

Merged: `4e849a8c2412792541469b32c5703d3e6cae347c`

### Fase 3 — Runtime compatibility adapters

- [x] mapping tool Agent legacy → capability Suite;
- [x] guard di completezza tool runtime;
- [x] viste logiche workspace per modulo;
- [x] facade GEO;
- [x] facade Agent;
- [x] boundary guard per import legacy;
- [x] Release Gate + Connector Package verdi.

Merged: `d587f723d20de501af7559546466c0e6526245bc`

### Fase 4 — Publish attivo e sicuro

- [x] `agentEnabled` separato dallo stato UI;
- [x] Publish `active` ma non Agent-enabled;
- [x] ownership di `Correzioni` trasferita a Publish;
- [x] remediation UI trasferita al boundary Publish;
- [x] Audit ristretto ad analisi/problemi/verifica;
- [x] sidebar ACT espone Publish;
- [x] viste dati Audit/Publish ristrette;
- [x] Release Gate + Connector Package verdi.

Merged: `bbe4d22918c6d6501d6026f725732d9ba25e39ec`

## Debito residuo controllato

La trasformazione non è una riscrittura massiva. Restano volutamente alcuni compatibility point:

1. `App.jsx` è ancora il consumer legacy diretto di `AgentPage` e `GeoPage`; le facade pubbliche esistono e i guard impediscono nuovi consumer diretti.
2. `WordPressLiveRemediationControlV2.jsx` e `batchRemediationRuntime.js` sono gli unici due consumer legacy ancora autorizzati a importare direttamente `wordpressRemediationEngine.js`.
3. Il runtime Agent continua a usare i sette tool ID legacy, mappati alle capability Suite.
4. I componenti fisici Publish sono ancora nei percorsi legacy, ma il bootstrap dipende già dalla facade `modules/publish/ui.js`.

Questi punti sono congelati da regression guard e possono essere eliminati progressivamente senza cambiare comportamento.

## Prossimi delta tecnici

Ordine consigliato:

1. migrare uno alla volta i due consumer residui del motore WordPress alla facade Publish;
2. spostare gradualmente le superfici Publish dietro il relativo modulo, senza cambiare API;
3. ridurre `App.jsx` facendo passare Agent/GEO e poi Rank/Content/Links da public facade;
4. creare public API dedicate per Rank, Content e Links;
5. sostituire progressivamente i tool Agent legacy con executor capability-backed mantenendo la compatibilità dei run salvati;
6. solo dopo, valutare route `/audit`, `/rank`, `/content`, `/links`, `/geo`, `/publish` native al posto degli alias hash legacy.

## Definition of done per modulo

Un dominio è considerato completamente estratto quando:

- ha una directory dedicata;
- espone una public API esplicita;
- non importa file privati di un altro dominio;
- usa Core per workspace/task/route comuni;
- dichiara le proprie capability;
- ha test di dominio e boundary guard;
- conserva compatibilità con fixture legacy dove necessaria;
- build e QA pertinenti passano;
- il comportamento utente cambia solo quando esplicitamente previsto.
