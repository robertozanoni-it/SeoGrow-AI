# Verifica Rank Math in una sola esecuzione

Il codice su GitHub non aggiorna il plugin installato su WordPress. Un errore
`taxonomy-doctor-convergence-capability: 404 rest_no_route` richiede prima
l'installazione del Connector completo. Ripetere quel test non risolve il blocco.

1. Installare `seogrow-connector-1.3.1.zip` da Plugin → Aggiungi nuovo → Carica plugin,
   sostituendo la versione installata. Non disinstallare il plugin prima della sostituzione.
2. In WordPress Staging E2E selezionare `rank-math-global` sul branch `main`.
3. Usare sito e hostname autorizzati, categoria/tag dell'incidente e `YES_I_UNDERSTAND`.
   Lasciare `recovery_original` vuoto: un eventuale bootstrap richiede il valore originale
   esatto documentato, mai ricostruito per far passare il test.
4. Leggere il riepilogo del run e l'artifact `rankmath-report-and-connector`.

La suite verifica inventari completi di categorie, tag e contenuti pubblici;
legge per tutte le categorie/tag title, description, canonical, robots e coerenza
API/database; controlla nell'HTML pubblico title, description, canonical e robots.
Le riparazioni riguardano esclusivamente la meta description della categoria/tag
indicati. Le altre risorse sono diagnosticate in sola lettura. Gli errori indipendenti
sono raccolti nello stesso report anche se manca una capability.

La copertura non comprende custom taxonomy, bozze/private, correttezza editoriale,
semantica schema, analytics, redirections o tutte le impostazioni di Rank Math.
Le pagine/articoli hanno controlli HTML, non una prova del database postmeta.
Una description dinamica, un noindex o un canonical diverso richiedono revisione:
la suite non cambia intenzioni SEO per ottenere un risultato verde.

Limiti: massimo 500 risorse controllate, budget scansione 8 minuti, workflow 20 minuti.
Inventario troncato, errori, budget superato e verifiche mancanti impediscono PASS.
Un timeout totale del job può impedire il report conclusivo: non equivale a successo.

## Recovery

Il journal con `convergencePending` sopravvive al vecchio hook `updated_term_meta`,
alle scadenze e alla riapparizione del marker. Il budget è persistente: due tentativi
complessivi, non due per ogni rilancio. Le mutazioni non vengono ritentate per errori
incerti di rete. Gli endpoint ricontrollano ownership e valore precedente; il lock
impedisce recovery/finalizzazioni concorrenti. Un lock lasciato da un crash richiede
ispezione del journal prima di una rimozione operativa: non viene rubato su timeout.

Il Doctor richiede due campioni consecutivi anche per uno stato inizialmente sano,
riprende la finalizzazione di un journal pendente solo con prova e conserva i byte
originali del backend. Le entità HTML comuni/numeriche sono decodificate per il
confronto pubblico. Meta description mancanti o duplicate bloccano la prova.
Il dedupe legacy delete/recreate non viene più invocato automaticamente dal Doctor:
le righe duplicate sono segnalate per una correzione specifica, senza rischiare
la perdita del valore se la ricreazione fallisce.

## Pacchetto e regressioni

`node scripts/package-connector.mjs` costruisce il ZIP con tutti i file PHP/INC,
verifica ogni require del loader e verifica gli hash dopo la riestrazione.
Il Release Gate controlla tutti i file PHP/INC e avvia
`php scripts/test-rankmath-journal.php`, che esegue funzioni e hook reali con stub
WordPress (non sostituisce la prova sul sito). I test JS eseguono il flusso Doctor
con trasporto simulato, incluse perdita ownership e risposta incerta a una scrittura.

## Regola permanente categorie — 6 settembre 2026

Per istruzione del proprietario, tutte le categorie devono essere indicizzabili,
su qualsiasi sito. Il controllo globale segnala `CATEGORY_NOINDEX_POLICY_VIOLATION`
per il noindex di una categoria. Non richiede nuovamente una decisione editoriale.
Questa regola riguarda `category`, non tag, template Elementor o altre risorse.
Non garantisce l'indicizzazione effettiva da parte di Google.

L'assenza di noindex nell'HTML è necessaria ma non sufficiente: canonical, stato HTTP,
robots.txt e header X-Robots-Tag vanno verificati per dichiarare indicizzabilità completa.
Il Doctor di recovery description non cambia automaticamente le impostazioni robots.
Se il noindex viene ereditato dalle impostazioni di Rank Math, la correzione deve
avvenire nelle impostazioni categorie, verificando poi anche eventuali override
per singola categoria. L'assenza di noindex nel solo termmeta non prova che il
frontend sia indicizzabile.
