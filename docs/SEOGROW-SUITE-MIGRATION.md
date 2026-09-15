# SeoGrow AI → SeoGrow Suite

Baseline iniziale: `main@2c4a8eef7b17d316726f5709bdffeaba46256726`  
Versione applicazione al baseline: `1.4.3`

## Obiettivo

Trasformare SeoGrow AI da applicazione monolitica a **modular monolith** estensibile, senza ricostruire il prodotto e senza perdere dati o funzionalità esistenti.

Architettura target:

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
│   ├── Workspace
│   ├── Clients / Sites
│   ├── Tasks / Actions
│   ├── History / Approvals
│   └── Module Registry
└── System / Integrations
    ├── OpenAI
    ├── DataForSEO
    ├── Google / Search Console
    └── WordPress / Rank Math / Elementor
```

## Invarianti di migrazione

1. Nessuna riscrittura da zero.
2. Nessuna cancellazione o reset del workspace esistente.
3. Le chiavi persistite `seogrow-*` restano compatibili finché una migrazione versionata non dimostra il contrario.
4. Il database IndexedDB esistente resta la fonte locale durante la migrazione.
5. Le route/hash legacy restano valide durante il refactor.
6. WordPress, Rank Math, Elementor, remediation, approvals e verification non vengono spostati in blocco.
7. Ogni estrazione di dominio mantiene i test correnti e aggiunge un regression guard sul nuovo confine.
8. Publish è il boundary delle azioni mutative: nessuna modifica WordPress cambia comportamento solo per effetto della riorganizzazione.
9. L'Agent orchestra capacità dei moduli e non duplica la business logic.
10. `main` riceve solo fasi verificabili, reversibili e coperte dal Release Gate pertinente.

## Baseline osservata

La UI legacy espone ancora concetti di dominio come pagine peer: `Audit SEO`, `Problemi`, `Correzioni`, `Posizionamenti`, `Opportunità`, `Link interni`, `Piano editoriale`, `GEO AI`, `SEO Agent`.

La tassonomia era storicamente ripetuta in più punti (App, UX guidata, wizard e route reconciliation). Module Registry, capability registry e compatibility layer sono ora la fonte strutturale per ownership, alias e capability della Suite.

Il workspace resta condiviso: clienti, task, analisi, Search Console, run agentici e remediation usano chiavi `seogrow-*`; IndexedDB mantiene il workspace locale e lo store delle correzioni. Non vengono creati database separati per i moduli.

## Ownership delle route

`src/core/modules/moduleRegistry.js` definisce il contratto tra il monolite ancora presente e la Suite.

| Pagina corrente | Modulo owner |
| --- | --- |
| Panoramica, Clienti, Centro progetto, Storico, SeoGrow AI | Hub |
| Audit SEO, Problemi | Audit |
| Posizionamenti, Opportunità | Rank & Growth |
| Piano editoriale | Content |
| Link interni | Links |
| GEO AI | GEO |
| Task | Tasks |
| SEO Agent | Agent |
| Correzioni | Publish |
| Integrazioni, Impostazioni | System |

`Publish` è attivo e possiede `Correzioni`, ma resta `agentEnabled: false`: le azioni mutative richiedono ancora proposta, approvazione, applicazione e verifica esplicite.

## Ownership runtime già estratta

La presenza di un facade non equivale all'estrazione completa. La tabella seguente distingue i confini pubblici già disponibili dalla business logic che è stata fisicamente spostata sotto ownership del dominio.

| Dominio | Ownership runtime già reale | Compatibilità legacy |
| --- | --- | --- |
| Audit | normalizzazione evidenze osservate, conteggio pagine osservato, delta score | `observedAuditData.js` è shim; consumer legacy censiti e bloccati contro nuove dipendenze |
| Rank & Growth | creazione e riuso task da opportunità Search | `opportunityTasks.js` è shim; altri helper ranking/opportunità sono ancora progressivamente estratti |
| Content | sicurezza HTML editoriale, regole H1 e preservazione link | `editorialContentSafety.js` è shim |
| Links | selettori di evidenza link e utility pubbliche di parsing link condivise con Content | helper legacy restano disponibili durante la migrazione |
| GEO | facade UI pubblico e capability registrate | implementazione UI legacy ancora raggiungibile dal boundary |
| Publish | remediation/publication boundary, Correzioni, preview/apply/verify/rollback | engine e UI legacy restano adattati dietro il facade |
| Agent | catalogo capability/tool, mapping legacy e facade pubblico | runtime legacy viene progressivamente instradato verso capability Suite |
| System | normalizzazione stato/proprietà Google e sessioni WordPress transitorie in memoria | `googleProperties.js` e `wordpressSession.js` sono shim |
| Hub / Tasks | facade e ownership route | business logic condivisa ancora in estrazione dal guscio legacy |

### Vincoli System già applicati

- le application password WordPress restano **solo in memoria**;
- nessuna sessione WordPress usa localStorage, IndexedDB o workspace persistito;
- isolamento sessione per progetto + installazione;
- TTL WordPress invariato a 30 minuti;
- clock incoerente/futuro resta fail-closed;
- stato Google mantiene la semantica precedente e non modifica il flusso OAuth/GSC.

## Compatibility layer

Durante la migrazione:

```text
Nuovo termine Suite  →  route legacy
Hub                   →  Panoramica
Audit                  →  Audit SEO
Rank / Rankings        →  Posizionamenti
Content                →  Piano editoriale
Links                  →  Link interni
GEO                    →  GEO AI
Publish                →  Correzioni
Agent                  →  SEO Agent
```

La risoluzione avviene a runtime e non riscrive i valori già salvati.

I file legacy trasformati in shim restano validi finché i consumer esistenti non sono migrati. I regression guard censiscono gli import legacy attuali e fanno fallire la CI se il debito aumenta.

## Storage Core

`src/core/workspace/storageKeys.js` centralizza progressivamente le chiavi persistite. La migrazione mantiene i nomi correnti finché un cambiamento non è giustificato e testato.

Prima di cambiare una chiave persistita servono sempre:

1. schema/versione di partenza;
2. migrazione esplicita;
3. rollback o compatibilità in lettura;
4. fixture del workspace precedente;
5. test import/export/restore.

Le estrazioni completate finora non richiedono migrazioni dati.

## Strategia di estrazione

### Fase 1 — Foundation

- module registry;
- ownership delle pagine;
- compatibility alias;
- storage key registry;
- capability registry;
- navigation/reconciler collegati al Core;
- facade pubblico per ogni modulo attivo;
- regression guard.

Stato: **completata come foundation**.

### Fase 2 — Audit

Obiettivo:

- Audit SEO;
- Problemi;
- detection/prioritization;
- normalizzazione/verifica delle evidenze.

Sequenza funzionale:

```text
Detect → Prioritize → Fix → Verify
```

`Fix` e le operazioni mutative appartengono a Publish.

Stato: **estrazione in corso**. Le utility di evidenza osservata sono già possedute da Audit; restano consumer legacy e altra logica da migrare.

### Fase 3 — Rank & Growth

Obiettivo:

- posizionamenti;
- Search Console ranking data;
- opportunità;
- creazione task da opportunità.

Stato: **estrazione in corso**. I task da opportunità sono già posseduti dal modulo; restano helper ranking/opportunità e consumer legacy.

### Fase 4 — Content

Obiettivo:

- piano editoriale;
- brief;
- generazione/ottimizzazione contenuti;
- topical map quando implementata come capacità reale;
- policy di sicurezza editoriale.

Stato: **estrazione in corso**. La sicurezza editoriale è già posseduta da Content e usa il public API Links per il parsing condiviso.

### Fase 5 — Links e GEO

Obiettivo: isolare i due domini senza cambiare storage o task globali.

Stato: **parzialmente estratta**. Links espone selettori e utility pubbliche; GEO ha facade e capability pubbliche.

### Fase 6 — Publish

Boundary di pubblicazione:

```text
proposal → approval → preview → apply → verify → receipt/rollback
```

Rank Math ed Elementor restano adapter/integration; non diventano logica di dominio UI.

Stato: **boundary attivo**. `Correzioni` appartiene a Publish; Publish resta escluso dall'esecuzione autonoma dell'Agent.

### Fase 7 — Agent orchestration

Ogni modulo espone capability/tool dichiarate. L'Agent seleziona e orchestra i tool senza importare direttamente business logic interna. Le capability mutative di Publish non sono abilitate automaticamente per l'Agent.

Stato: **boundary e catalogo attivi**, con migrazione dei consumer ancora progressiva.

### Fase 8 — Experience

Navigazione target:

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

Le vecchie route restano alias finché backup, URL interni, UI e test non dipendono più dai vecchi nomi.

## Definition of done per modulo

Un dominio è considerato completamente estratto solo quando:

- ha una directory dedicata;
- espone un public API esplicito;
- possiede la propria business logic invece di re-esportarla soltanto;
- non importa file privati di un altro dominio;
- usa Core per workspace/task/route comuni;
- ha test di dominio e boundary guard;
- conserva le fixture legacy necessarie;
- i consumer legacy sono eliminati o ridotti a shim senza nuova dipendenza;
- build e QA pertinente passano;
- il comportamento utente non cambia salvo modifica esplicitamente richiesta.

## Stato corrente

### Foundation e boundary consolidati

- [x] baseline e invarianti fissati;
- [x] Module Registry indipendente da React;
- [x] ownership delle route legacy;
- [x] compatibility alias;
- [x] registry delle principali chiavi workspace;
- [x] capability registry e disponibilità Agent;
- [x] navigation compatibility collegata al registry;
- [x] page route reconciliation collegata al registry;
- [x] public facade per Hub, Audit, Rank, Content, Links, GEO, Tasks, Agent, Publish e System;
- [x] regression guard che richiede un facade per ogni modulo Suite attivo;
- [x] Audit separato dalle azioni mutative di Publish;
- [x] Publish attivo e owner di `Correzioni`;
- [x] Publish mantenuto non autonomamente eseguibile dall'Agent.

### Business logic già spostata dal monolite

- [x] Rank: task da opportunità Search;
- [x] Content: sicurezza HTML editoriale;
- [x] Audit: normalizzazione delle evidenze osservate e score delta;
- [x] System: stato/proprietà Google;
- [x] System: sessione WordPress transitoria e non persistente;
- [x] Links: selettori di evidenza e utility pubbliche necessarie a Content.

### Debito legacy controllato

I consumer legacy non vengono nascosti né dichiarati rimossi: sono censiti da test. Finché alcuni componenti grandi restano nel guscio legacy, i relativi shim sono mantenuti e la CI impedisce la crescita del numero di import diretti.

## Prossimo delta tecnico

Non servono altre cartelle o facade vuoti. Il prossimo lavoro deve ridurre il monolite per **delta piccoli e verificabili**:

1. ridurre i consumer legacy dei boundary già estratti, iniziando dai file JS puri e lasciando `App.jsx` per ultimo;
2. continuare Rank con gli helper `opportunityGroups`, `queryChanges`, `queryTaskDetail` e `opportunityQueries`;
3. continuare Content con piano editoriale/brief senza duplicare `platform.js`;
4. continuare Audit con helper puri di problemi/evidenze, mantenendo `Fix` in Publish;
5. continuare System con provider/budget e integrazioni solo dopo aver definito API pure tra domini, evitando import privati;
6. ridurre progressivamente `App.jsx` a shell/compose layer quando i domini sottostanti sono già coperti da facade, shim e regression guard.

Priorità operativa: **consumer legacy piccoli → ownership runtime → test di equivalenza → Release Gate → merge → delta successivo**.
