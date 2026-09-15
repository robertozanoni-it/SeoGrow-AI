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
│   ├── Audit & Fix
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
└── Integrations
    ├── OpenAI
    ├── DataForSEO
    └── WordPress / Rank Math / Elementor
```

## Invarianti di migrazione

1. Nessuna riscrittura da zero.
2. Nessuna cancellazione o reset del workspace esistente.
3. Le chiavi persistite `seogrow-*` restano compatibili finché una migrazione versionata non dimostra il contrario.
4. Il database IndexedDB esistente resta la fonte locale durante la prima fase.
5. Le route/hash legacy restano valide durante il refactor.
6. WordPress, Rank Math, Elementor, remediation, approvals e verification non vengono spostati in blocco.
7. Ogni estrazione di dominio deve mantenere i test correnti e aggiungere un test di regressione sul nuovo confine.
8. Publish viene introdotto come boundary prima di diventare una pagina: nessuna modifica WordPress deve cambiare comportamento solo per effetto della riorganizzazione.
9. L'Agent deve orchestrare capacità dei moduli, non duplicarne la business logic.
10. `main` riceve solo fasi verificabili e reversibili.

## Baseline osservata

La UI corrente espone concetti di dominio come pagine peer: `Audit SEO`, `Problemi`, `Correzioni`, `Posizionamenti`, `Opportunità`, `Link interni`, `Piano editoriale`, `GEO AI`, `SEO Agent`.

La stessa tassonomia è ripetuta in più punti (App, UX guidata, wizard e route reconciliation). Questo rende costoso rinominare o raggruppare una funzione senza rischiare divergenze.

Il workspace è già condiviso: clienti, task, analisi, Search Console, run agentici e remediation usano chiavi `seogrow-*`; IndexedDB mantiene un mirror/transazione del workspace e uno store separato per le correzioni. Non serve creare database separati per i moduli.

## Prima estrazione: Module Registry

`src/core/modules/moduleRegistry.js` diventa il contratto iniziale tra il monolite corrente e la Suite.

Ownership legacy:

| Pagina corrente | Modulo owner |
| --- | --- |
| Panoramica, Clienti, Centro progetto, Storico, SeoGrow AI | Hub |
| Audit SEO, Problemi, Correzioni | Audit & Fix |
| Posizionamenti, Opportunità | Rank & Growth |
| Piano editoriale | Content |
| Link interni | Links |
| GEO AI | GEO |
| Task | Tasks |
| SEO Agent | Agent |
| Integrazioni, Impostazioni | System |

`Publish` è già registrato come modulo `planned`, ma non possiede ancora route legacy. Questo evita di creare una UI vuota o spostare prematuramente la remediation WordPress.

## Compatibility layer

Durante la migrazione:

```text
Nuovo termine Suite  →  route legacy
Hub                   →  Panoramica
Audit & Fix           →  Audit SEO
Rank / Rankings       →  Posizionamenti
Content               →  Piano editoriale
Links                 →  Link interni
GEO                   →  GEO AI
Agent                 →  SEO Agent
```

La risoluzione avviene a runtime e non riscrive i valori già salvati.

## Storage Core

`src/core/workspace/storageKeys.js` centralizza progressivamente le chiavi persistite. La prima fase mantiene esattamente i nomi correnti per evitare migrazioni dati inutili.

Prima di cambiare una chiave persistita serviranno sempre:

1. schema/versione di partenza;
2. migrazione esplicita;
3. rollback o compatibilità in lettura;
4. fixture del workspace precedente;
5. test import/export/restore.

## Strategia di estrazione

### Fase 1 — Foundation

- module registry;
- ownership delle pagine;
- compatibility alias;
- storage key registry;
- navigation/reconciler collegati al Core;
- regression guard.

### Fase 2 — Audit & Fix

Estrarre per primi i componenti e servizi di:

- Audit SEO;
- Problemi;
- Correzioni;
- remediation verification.

La sequenza funzionale deve diventare esplicita:

```text
Detect → Prioritize → Fix → Verify
```

### Fase 3 — Rank & Growth

Raggruppare:

- posizionamenti;
- Search Console ranking data;
- opportunità;
- creazione task da opportunità.

### Fase 4 — Content

Raggruppare:

- piano editoriale;
- brief;
- generazione/ottimizzazione contenuti;
- futuro topical map.

### Fase 5 — Links e GEO

Isolare i due domini senza cambiare storage o task globali.

### Fase 6 — Publish

Introdurre il boundary di pubblicazione sopra le capacità WordPress esistenti:

```text
proposal → approval → preview → apply → verify → receipt/rollback
```

Rank Math ed Elementor restano adapter/integration; non diventano logica di dominio UI.

### Fase 7 — Agent orchestration

Ogni modulo espone capability/tool dichiarate. L'Agent seleziona e orchestra i tool senza importare direttamente business logic interna.

### Fase 8 — Experience

Semplificare la navigazione visibile dopo che i confini sono reali:

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

Le vecchie route possono restare alias finché backup, URL interni e test non dipendono più dai vecchi nomi.

## Definition of done per modulo

Un dominio è considerato estratto solo quando:

- ha una directory dedicata;
- espone un public API esplicito;
- non importa file privati di un altro dominio;
- usa Core per workspace/task/route comuni;
- ha test di dominio;
- conserva le fixture legacy;
- il build passa;
- la QA pertinente passa;
- il comportamento utente non cambia salvo modifica esplicitamente richiesta.

## Stato

### Completato in questa branch

- [x] baseline fissata;
- [x] branch di migrazione separata da `main`;
- [x] module registry indipendente da React;
- [x] ownership delle route legacy;
- [x] boundary `Publish` pianificato senza route attiva;
- [x] registry delle principali chiavi workspace;
- [x] navigation compatibility collegata al registry;
- [x] page route reconciliation collegata al registry;
- [x] regression test della foundation.

### Prossimo delta tecnico

Il primo dominio da estrarre è **Audit & Fix**, perché oggi `Audit SEO`, `Problemi` e `Correzioni` sono già strettamente collegati dal workflow di remediation e verifica. L'estrazione deve iniziare con facade/public API e adapter, non con spostamenti massivi di file.
