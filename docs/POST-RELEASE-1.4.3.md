# Post-release plan — SeoGrow AI 1.4.3

## Principio
La prima finestra dopo la release è di sola stabilizzazione. Nessuna nuova feature viene promossa finché la finestra non viene chiusa esplicitamente e non ci sono P0/P1 aperti.

## Error logging
Fonti da usare senza aggiungere nuova telemetria alla RC:
- log runtime server/launcher;
- errori browser già intercettati da QA (`Runtime.exceptionThrown`, `console.error`, network failures non cancellati);
- report QA e RC performance;
- journal/receipt delle Correzioni e remediation WordPress;
- log Agent/GEO già persistiti nel relativo dominio.

Non salvare API key, password applicative, OAuth secret, payload sensibili o contenuti cliente non necessari al debug.

## Feedback
Ogni feedback post-release viene classificato come:
- bug riproducibile;
- UX/chiarezza;
- performance;
- integrazione/provider;
- richiesta futura.

Le richieste future entrano nel backlog ma non vengono implementate durante la stabilizzazione.

## Bug triage
- **P0**: perdita/corruzione dati, scrittura sul progetto sbagliato, bypass sicurezza, rollback indisponibile dopo write. Azione: blocco release/kill-switch e fix immediato.
- **P1**: flusso core non utilizzabile senza workaround affidabile. Azione: bugfix prioritario e nuova Release Gate.
- **P2**: difetto funzionale con workaround sicuro. Azione: pianificare dopo P0/P1.
- **P3**: difetto cosmetico/documentale o miglioramento non bloccante.

Ogni bugfix deve includere riproduzione, test di regressione e Release Gate verde.

## Usage metrics
Durante la stabilizzazione usare solo dati aggregati già disponibili o derivabili localmente, senza introdurre tracking esterno nuovo:
- numero progetti attivi nel workspace;
- audit completati/falliti;
- correzioni applicate/verificate/rollback;
- task creati/completati;
- chiamate provider riuscite/fallite e latenza aggregata quando già disponibile;
- errori per categoria, senza credenziali o payload sensibili.

## Roadmap successiva
La roadmap successiva viene alimentata da feedback e P2/P3, ma resta non eseguibile durante la stabilizzazione. Priorità candidate: affidabilità, semplificazione UX, performance, copertura provider e riduzione dei passaggi manuali. Nessun nuovo modulo prima della rivalutazione dell’architettura congelata.

## Exit criteria stabilizzazione
La finestra può essere chiusa solo quando:
1. nessun P0/P1 è aperto;
2. gli ultimi bugfix hanno Release Gate verde;
3. rollback/backup/kill-switch restano verificati;
4. non risultano regressioni di persistenza o cross-project;
5. il backlog futuro è separato dai bug di stabilizzazione.
