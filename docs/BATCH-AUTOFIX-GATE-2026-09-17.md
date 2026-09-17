# Batch AutoFix execution gate — 2026-09-17

## Obiettivo

Completare Batch AutoFix come orchestratore sicuro di correzioni multiple senza indebolire il gate AutoFix già integrato: nessuna write è completata senza verifica reale.

## Contratto

Un batch supporta:

- selezione multipla dei problemi visibili;
- raggruppamento esplicito per rischio di mutazione;
- ordine di esecuzione deterministico;
- stop al primo errore critico;
- rollback della singola modifica tramite lo storico Correzioni;
- report finale JSON/CSV con esiti, rischio, ordine, rollback e critical stop.

## Gruppi di rischio

I gruppi descrivono il rischio della mutazione, non la gravità SEO del finding:

- **Alto**: canonical, noindex, H1, contenuto, link esterno;
- **Ordinario**: title, meta description, excerpt e altre write dirette supportate;
- **Assistito / manuale**: ownership ambigua, risorse non modificabili e casi senza writer deterministico;
- **Sola lettura**: finding già risolti/intenzionali e verifiche read-only.

Le operazioni ad alto rischio mantengono l'approvazione esplicita individuale.

## Ordine di esecuzione

L'ordine è calcolato prima dell'approvazione e fa parte del fingerprint del piano.

Tra operazioni contemporaneamente eseguibili viene preferito il rischio minore. Le dipendenze hanno sempre precedenza: il sistema non riordina mai una modifica davanti a una dipendenza necessaria.

Ogni entry preparata riceve `executionOrder` e il report finale conserva il piano realmente eseguito.

## Stop critico

Il batch registra il primo errore critico con:

- entry/problema;
- fase (`preflight`, `validate`, `apply`, `verify`);
- codice;
- motivo;
- timestamp.

Sono critici gli errori sistemici (autenticazione, rate limit, cambio scope, storage/revision, connessione) e qualunque errore di apply in cui non sia dimostrabile che nessuna write sia partita.

Dopo il primo errore critico nessuna nuova write viene avviata. Le operazioni successive diventano `BLOCKED` e il run termina `INTERRUPTED`.

Un fallimento isolato e sicuramente pre-write resta invece locale e non blocca le operazioni indipendenti successive.

## Rollback singolo

Ogni operazione applicata conserva un `correctionId` e lo snapshot Prima/Dopo nel journal Correzioni.

Dal batch è disponibile **Apri rollback di questa modifica**. Il passaggio apre Correzioni filtrato sulla singola modifica; il rollback continua a usare le guardie esistenti:

- snapshot `after` come `expectedCurrent`;
- stale-state check;
- writer shared Elementor dedicato quando la risorsa è `elementor_library`;
- nessuna sovrascrittura cieca di modifiche esterne.

## Report finale

`batchFinalReport()` include:

- stato batch e durata;
- riepilogo esiti;
- gruppi di rischio;
- primo critical stop;
- ordine reale delle operazioni;
- correction ID;
- disponibilità rollback per singola modifica.

Il CSV espone gli stessi dati operativi essenziali; il JSON include anche il `finalReport` strutturato e resta soggetto alla sanitizzazione dello storico batch.

## Gate di test misto

Il Release Gate deve includere un unico batch misto che produca contemporaneamente:

- fix riusciti e verificati;
- un elemento saltato/consolidato;
- un intervento manuale/assistito;
- un fallimento non critico;
- prosecuzione delle operazioni indipendenti dopo il fallimento non critico.

Un test separato deve dimostrare che un errore critico ferma immediatamente tutte le write successive e viene riportato nel `finalReport`.

## Invarianti

- nessun nuovo modulo top-level;
- nessun nuovo provider;
- approval/fingerprint e gate AutoFix restano obbligatori;
- nessun rollback cieco;
- nessuna write incerta viene ritentata automaticamente;
- `SUCCESS` resta riservato a batch completamente risolti e verificati.
