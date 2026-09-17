# SeoGrow Suite — Architecture Freeze

Data freeze: **2026-09-17**

## Decisione

La tassonomia prodotto della Suite è congelata sui seguenti **14 moduli canonici**, nell'ordine di navigazione definitivo:

1. Panoramica
2. Clienti
3. Centro progetto
4. Audit SEO
5. Posizionamenti
6. Link interni
7. Opportunità
8. Correzioni
9. Task
10. Piano editoriale
11. SEO Agent
12. GEO AI
13. Integrazioni
14. Impostazioni

Finché questi moduli non soddisfano i rispettivi criteri di completezza non si aggiungono nuovi moduli top-level e non si introducono nuove pagine peer nella sidebar.

Questo freeze riguarda la **tassonomia prodotto e la navigazione**. L'architettura interna modular-monolith esistente resta valida: i domini tecnici possono continuare a possedere più superfici legacy durante la migrazione, purché non diventino nuovi moduli utente e non duplichino ownership funzionale.

## Gate architetturale

Il gate è PASS solo quando valgono contemporaneamente queste condizioni:

- esistono esattamente 14 moduli canonici;
- l'ordine della sidebar coincide con l'ordine congelato;
- ogni modulo definisce input, output, dati usati, CTA principale, stato vuoto, stato errore e stato completato;
- ogni capability di prodotto ha un solo owner;
- nessuna pagina canonica compare due volte;
- nessuna nuova pagina top-level viene aggiunta fuori dal contratto congelato;
- le viste legacy non compaiono nella navigazione primaria;
- wizard e percorsi guidati puntano solo ai moduli canonici;
- SEO Agent orchestra capability pubbliche e non duplica business logic dei moduli;
- Audit SEO rileva/prioritizza/verifica, mentre Correzioni resta l'unico boundary delle azioni mutative;
- le integrazioni AI/SEO restano entro il vincolo esistente: **OpenAI ufficiale + DataForSEO**, oltre agli adapter di sistema già supportati come WordPress/Rank Math/Elementor e allo stato Google/Search Console già previsto.

Il contratto eseguibile è in `src/suite/productArchitecture.js`; `src/productArchitecture.test.js` rende il freeze un regression gate.

## Viste legacy assorbite

| Vista legacy | Owner canonico | Regola |
| --- | --- | --- |
| `Storico` | Centro progetto | resta leggibile per compatibilità, ma non è più una voce peer; nuovo lavoro su storico/report appartiene a Centro progetto |
| `Problemi` | Audit SEO | resta leggibile per compatibilità, ma non è più una voce peer; detection, priorità ed evidenze appartengono ad Audit SEO |
| `SeoGrow AI` | SEO Agent | resta compatibilità legacy, ma non è più un Hub AI separato; nuova orchestrazione appartiene a SEO Agent |

Le viste legacy non ricevono nuove capability proprietarie. Ogni nuovo sviluppo va nel modulo canonico corrispondente.

## Contratti dei moduli

### 1. Panoramica

- **Input:** progetto selezionato; stato workspace.
- **Output:** sintesi salute progetto; prossima azione utile.
- **Dati usati:** clienti/progetti, ultimo audit, posizionamenti, opportunità, task, stato integrazioni.
- **CTA principale:** `Apri prossima azione`.
- **Stato vuoto:** nessun progetto selezionato; invita a scegliere o creare un cliente.
- **Stato errore:** mostra solo i dati di riepilogo non disponibili senza bloccare gli altri moduli.
- **Stato completato:** mostra stato aggiornato, priorità e una sola prossima azione.
- **Ownership:** overview progetto e routing della prossima azione; non esegue audit, remediation o task logic.

### 2. Clienti

- **Input:** anagrafica cliente; sito/progetto.
- **Output:** portfolio clienti; progetto attivo.
- **Dati usati:** clienti, progetti, URL associati, stato configurazione.
- **CTA principale:** `Aggiungi cliente`.
- **Stato vuoto:** percorso per aggiungere il primo cliente.
- **Stato errore:** isola il record non caricabile senza compromettere gli altri.
- **Stato completato:** cliente salvato e progetto selezionabile senza duplicazioni.
- **Ownership:** portfolio clienti e selezione progetto.

### 3. Centro progetto

- **Input:** cliente/sito selezionato; obiettivi progetto.
- **Output:** configurazione progetto; riepilogo operativo; storico e report.
- **Dati usati:** profilo progetto, storico analisi, configurazione report, stato integrazioni, attività progetto.
- **CTA principale:** `Configura progetto`.
- **Stato vuoto:** richiede un progetto attivo.
- **Stato errore:** segnala la sezione non caricabile preservando il resto del progetto.
- **Stato completato:** configurazione, storico e report sono coerenti nello stesso modulo.
- **Ownership:** configurazione, storico e reporting progetto.

### 4. Audit SEO

- **Input:** URL/sito; perimetro audit.
- **Output:** risultato audit; problemi prioritizzati; evidenze di verifica.
- **Dati usati:** crawl osservato, analisi salvate, evidenze pagina, chiusure problema, stato correzioni in sola lettura.
- **CTA principale:** `Avvia audit SEO`.
- **Stato vuoto:** configurazione e avvio del primo audit.
- **Stato errore:** conserva l'ultimo audit valido e spiega il fallimento.
- **Stato completato:** problemi attivi/risolti/verificabili sono presentati nello stesso modulo.
- **Ownership:** esecuzione audit, detection, prioritizzazione, verifica read-only.
- **Non possiede:** write WordPress, apply o rollback.

### 5. Posizionamenti

- **Input:** progetto; query/keyword; intervallo.
- **Output:** posizionamenti; variazioni; trend keyword.
- **Dati usati:** DataForSEO, dati Search Console supportati, storico ranking.
- **CTA principale:** `Aggiorna posizionamenti`.
- **Stato vuoto:** richiede fonte dati o primo aggiornamento.
- **Stato errore:** distingue provider, dati mancanti e periodo non disponibile.
- **Stato completato:** ranking aggiornati con confronto precedente.
- **Ownership:** tracking ranking e performance keyword.

### 6. Link interni

- **Input:** pagine sito; contenuti/link osservati.
- **Output:** mappa link; raccomandazioni; evidenze anchor.
- **Dati usati:** crawl pagine, grafo link, anchor text, contenuti indicizzabili.
- **CTA principale:** `Analizza link interni`.
- **Stato vuoto:** richiede un audit o dati pagina utilizzabili.
- **Stato errore:** segnala dati incompleti senza inventare collegamenti.
- **Stato completato:** ogni raccomandazione mostra sorgente, destinazione e motivazione.
- **Ownership:** analisi e raccomandazioni internal linking.

### 7. Opportunità

- **Input:** ranking; audit; dati crescita disponibili.
- **Output:** opportunità ordinate; priorità; azioni candidate.
- **Dati usati:** DataForSEO, dati Search Console supportati, audit, contenuti, task esistenti.
- **CTA principale:** `Genera opportunità`.
- **Stato vuoto:** spiega se non ci sono opportunità o quale fonte manca.
- **Stato errore:** non crea task duplicati quando il calcolo fallisce.
- **Stato completato:** opportunità deduplicate e convertibili in task espliciti.
- **Ownership:** analisi e priorità delle opportunità di crescita.

### 8. Correzioni

- **Input:** problema; proposta remediation; approvazione utente.
- **Output:** prima/dopo; modifica preparata/applicata; verifica e ricevuta rollback.
- **Dati usati:** problemi Audit SEO, approvazioni, WordPress, Rank Math, Elementor, storico remediation.
- **CTA principale:** `Correggi automaticamente`.
- **Stato vuoto:** nessuna correzione pronta; rimanda ai problemi attivi dell'Audit SEO.
- **Stato errore:** blocca l'apply, conserva la proposta e mostra errore/prova/rollback disponibile.
- **Stato completato:** modifica verificata con ricevuta; un problema risolto non resta tra gli attivi.
- **Ownership:** proposta, approvazione, write boundary, verify e rollback.

### 9. Task

- **Input:** azione manuale; problema; opportunità.
- **Output:** task; avanzamento; chiusura verificata.
- **Dati usati:** task workspace, clienti, problemi, opportunità, stato completamento.
- **CTA principale:** `Nuovo task`.
- **Stato vuoto:** permette di creare un task o partire da problema/opportunità.
- **Stato errore:** evita duplicazioni del record.
- **Stato completato:** task fuori dalle viste attive ma conservato nello storico necessario.
- **Ownership:** gestione e lifecycle task.

### 10. Piano editoriale

- **Input:** obiettivi; keyword/opportunità; contesto sito.
- **Output:** piano; brief; priorità pubblicazione.
- **Dati usati:** opportunità, ranking, contenuti esistenti, link interni, regole editoriali.
- **CTA principale:** `Genera piano editoriale`.
- **Stato vuoto:** richiede dati minimi prima della generazione.
- **Stato errore:** conserva il piano precedente e mostra l'input mancante.
- **Stato completato:** piano salvato con brief, priorità e fonti che lo hanno generato.
- **Ownership:** planning editoriale, brief e sicurezza editoriale.

### 11. SEO Agent

- **Input:** obiettivo utente; contesto progetto; capability pubbliche.
- **Output:** piano agentico; azioni orchestrate; run verificabile.
- **Dati usati:** API pubbliche dei moduli, workspace, OpenAI ufficiale, storico run.
- **CTA principale:** `Chiedi a SEO Agent`.
- **Stato vuoto:** richiede un obiettivo.
- **Stato errore:** identifica capability/step fallito senza duplicare business logic del modulo owner.
- **Stato completato:** run con piano, azioni e riferimenti ai moduli responsabili.
- **Ownership:** orchestrazione cross-module e storia run; nessuna ownership di audit, ranking, content o remediation.

### 12. GEO AI

- **Input:** sito; contenuti; entità/query rilevanti.
- **Output:** analisi GEO; gap answerability; raccomandazioni.
- **Dati usati:** contenuti sito, audit, segnali strutturati, OpenAI ufficiale.
- **CTA principale:** `Avvia analisi GEO`.
- **Stato vuoto:** richiede progetto con contenuti disponibili.
- **Stato errore:** distingue dati mancanti da errore AI.
- **Stato completato:** score, gap e azioni tracciabili.
- **Ownership:** analisi e raccomandazioni GEO.

### 13. Integrazioni

- **Input:** configurazione connessione; credenziali consentite.
- **Output:** stato connessioni; diagnostica.
- **Dati usati:** OpenAI ufficiale, DataForSEO, WordPress, Rank Math, Elementor, stato Google/Search Console supportato.
- **CTA principale:** `Verifica integrazioni`.
- **Stato vuoto:** mostra solo integrazioni realmente supportate.
- **Stato errore:** indica connessione e causa senza persistere segreti impropriamente.
- **Stato completato:** connessioni verificate e provider non supportati assenti.
- **Ownership:** configurazione integrazioni e connection health.

### 14. Impostazioni

- **Input:** preferenze; policy locali; backup/ripristino.
- **Output:** configurazione suite; esito backup/ripristino.
- **Dati usati:** preferenze UI, policy sicurezza, workspace esportabile, configurazione non segreta.
- **CTA principale:** `Salva impostazioni`.
- **Stato vuoto:** usa default sicuri.
- **Stato errore:** rifiuta configurazioni/backup invalidi senza sovrascrivere lo stato valido.
- **Stato completato:** impostazioni validate e persistite con esito esplicito.
- **Ownership:** preferenze suite, backup/restore, impostazioni sicurezza.

## Regole anti-sovrapposizione

1. Un modulo può **consumare** dati di altri moduli, ma non può possederne la business logic.
2. Panoramica sintetizza e instrada: non implementa le funzioni operative dei moduli.
3. Centro progetto possiede configurazione/storico/report, non audit o task.
4. Audit SEO possiede detection/priorità/verifica read-only; Correzioni possiede mutazioni e rollback.
5. Opportunità identifica cosa conviene fare; Task gestisce l'esecuzione organizzativa.
6. Piano editoriale possiede planning e brief; Link interni possiede link graph e raccomandazioni.
7. SEO Agent orchestra soltanto API pubbliche; non introduce copie della logica dei moduli.
8. Integrazioni configura connessioni; Impostazioni configura il comportamento della Suite.

## Definition of Done prima di sbloccare nuovi moduli

L'architecture freeze può essere rivalutato solo quando, per tutti i 14 moduli:

- la CTA principale è funzionante end-to-end;
- stato vuoto, errore e completato sono implementati e testati;
- dati reali e fallback sono dichiarati;
- non esistono pagine peer duplicate;
- nessuna funzione è posseduta da due moduli;
- route, sidebar, wizard e ricerca usano la tassonomia canonica;
- le viste legacy necessarie sono state assorbite o mantenute esclusivamente come compatibility adapter;
- lint, test, build e browser QA pertinenti sono verdi;
- per azioni mutative WordPress/Elementor resta valido il relativo release gate live/fail-closed.
