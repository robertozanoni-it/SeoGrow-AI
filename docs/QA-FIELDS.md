# Copertura dei campi — 8 settembre 2026

Il collaudo usa i moduli React reali e IndexedDB in un profilo Chrome usa e getta.
`npm run qa:full` e `npm run qa:release` richiedono gli scenari `FIELDS-*`, oltre
alle regressioni già presenti. Il gate li esegue su Linux e macOS; su macOS la
cartella del checkout contiene spazi. Non occorrono credenziali reali.

## Inventario della UI attiva

| Area | Campi | Prova |
| --- | --- | --- |
| Clienti | Nome, sito web | Obbligatorietà, nome di soli spazi, dominio duplicato, creazione, modifica, ID conservato, reload |
| Task | Titolo, progetto, priorità, stato, scadenza, URL sorgente/destinazione, istruzioni, note | Valori salvati e riletti nel dettaglio dopo reload; CRUD e doppio submit nella matrice precedente |
| Task di ricerca | Conferma manuale query–pagina | Conferma, reload e revoca esplicita |
| Task e viste salvate | Ricerca, stato, stato per riga, nome vista, vista selezionata | Filtri AND, salvataggio/richiamo, selectedViewId, modifica manuale, undo, 500 task e isolamento progetto |
| Preferenze | Nome, frequenza, approvazione WordPress, notifiche, copie locali, salvataggio bozze | Modifica e reload di tutti i controlli; ripristino delle preferenze della fixture |
| Centro progetto | Obiettivo, brand, titolo report, colore, introduzione, cinque sezioni | Persistenza, riepilogo wizard, ultima sezione non deselezionabile |
| Monitoraggio | Avvisi, soglia, abilitazione audit, frequenza | Valori e cambio checkbox nella fixture; nessuna misura di schedulazione su sito cliente |
| Posizionamenti | Keyword, profondità, dispositivo, località, lingua | Deduplicazione keyword, payload esatto, errore 400, risposta simulata e storico salvato |
| Contenuti | Formato, argomento, testo della bozza | Generazione vuota rifiutata, generazione simulata, modifica manuale, autosave e reload |
| Bozza WordPress | Tipo articolo/pagina | Opzione pagina disabilitata senza capacità, selezione con capacità simulate; nessun invio di contenuti |
| Topical map | Argomenti, località, lingua | Payload e salvataggio di una risposta sintetica |
| Google | Proprietà, file ZIP | Elenco 19 proprietà, selezione e payload import, errore API; ZIP invalido e ZIP valido con CSV sintetici, stato salvato e picker resettato |
| Connessione WordPress | URL, utente, password applicativa | Payload, errore 403 e retry; password assente dal profilo persistente e vuota dopo reload |
| Audit | URL pagina/sito, numero massimo pagine | Validazione URL, limiti, payload e errori per pagina/sito |
| Nuova analisi in finestra | URL iniziale, numero massimo pagine | Apertura tramite Comandi, payload e errore locale |
| Problemi | Ricerca, tipo, fonte, adapter, correggibilità, segnale speciale | Selezioni disponibili, risultato vuoto della ricerca e reset; adapter privo di correzioni mostra solo Tutti |
| Comandi e ricerca globale | Testo ricerca | Nessun risultato, risultato filtrato, apertura destinazione; ricerca task globale |
| Progetto attivo e Correzioni | Progetto, password della correzione | Cambio progetto: password precedente non esposta al nuovo cliente |
| SEO Agent | Modalità, obiettivo, cronologia | Obiettivo vuoto blocca avvio; tre modalità selezionabili; esecuzione locale sola lettura, storico e selezione dopo reload |
| Calendario | Mese, scadenza attività | Febbraio bisestile, scadenza salvata/riletta, rimozione |
| GEO | Domande | Salvataggio all'uscita dal campo, reload anche della lista volutamente vuota, payload simulazione e errore remoto simulato |
| Remediation taxonomy | Credenziali, problema selezionato, canonical, intento index/noindex, relative conferme | Ispezione simulata; preparazione bloccata senza conferma; modifica del valore revoca la conferma; cambio problema o password invalida subito la precedente ispezione e ne richiede una nuova; nessun apply |
| Backup | Password, file JSON | Password minima, esportazione cifrata dal pulsante, password errata senza mutazioni, import valido e reload atomico con task conservati |

## Limiti precisi

- Le risposte di Google, OpenAI, DataForSEO e WordPress sono simulate. Le prove
  coprono i campi e la gestione delle risposte, non disponibilità, credenziali,
  costi o permessi dei servizi reali.
- L'URI OAuth mostrato nelle Integrazioni è un valore di sola lettura, non un
  campo configurabile. Il collegamento OAuth reale resta distinto dal mock.
- Il vecchio `AuditPage`/`AuditResults` rimane nel codice ma viene nascosto da
  `AuditWorkspace` (`.audit-workspace-active`). I suoi filtri e le sue viste non
  costituiscono il percorso visibile collaudato: non vengono contati come PASS.
- Il controllo estetico completo, gli screen reader e tutti i browser non sono
  certificati da questo gate. Restano le prove automatiche di geometria e focus
  a 1440, 768 e 390 pixel della matrice esistente.
- G07 shared Elementor resta PARTIAL. Non sono state eseguite nuove scritture
  WordPress, prove live della matrice ruoli o creazioni di utenti.
- Un PASS riguarda i casi elencati: non dimostra assenza di qualunque possibile
  bug o copertura di tutte le combinazioni arbitrarie di input.

## Esito del batch

PR [#73](https://github.com/robertozanoni-it/SeoGrow-AI/pull/73) e
[#74](https://github.com/robertozanoni-it/SeoGrow-AI/pull/74) **merged**.
Release Gate delle PR [#752 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34221761562)
e [#761 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34225075612).

La matrice finale richiede 22 scenari `FIELDS-*`: 32 scenari browser in `full`,
34 in `release`, oltre ai 614 test Node. Lint, build, browser su Linux/macOS,
launcher macOS, controlli PHP/Connector e dependency audit PASS nel gate #761.
I risultati riguardano l'inventario e i limiti sopra indicati.

Le prove hanno portato a correggere nomi cliente di soli spazi, etichetta della
bozza, completamento asincrono degli import Google/ZIP, aggiornamento Correzioni
al cambio progetto, conservazione delle domande GEO vuote, navigazione dei
portal Problemi/Correzioni e invalidazione dell'ispezione taxonomy quando cambia
il suo contesto. I gate intermedi falliti sono stati diagnosticati e corretti
prima del merge; nessuno scenario obbligatorio è stato rimosso o saltato.

Gate post-merge del codice: [#762 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34225505395),
commit `7c55f414d0d1db6516a2a189f2fc468e34b04f99`.
