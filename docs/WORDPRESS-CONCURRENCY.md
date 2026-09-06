# Protezione concorrenza WordPress — 2026-09-06

Stato: protezione fail-closed implementata; writer atomico funzionante BLOCCATO.
Questa modifica non rende disponibili scritture atomiche WordPress. Il Connector 1.3.2 rifiuta tutte le mutazioni dell'endpoint atomic-write, anche quando lo snapshot coincide. Non installato sul sito reale.

## Causa e impatto

Le route live-apply/live-rollback facevano GET, confronto, POST REST separati. Il writer tassonomia controllava il valore prima di invocare il salvataggio del plugin. Una modifica esterna poteva inserirsi dopo il confronto ed essere sovrascritta. Il controllo del solo server e un lock cooperativo SeoGrow non proteggono dalle scritture di editor, plugin o altri client.

## Modifica

- Scritture di remediation e rollback di pagine/post/meta e tassonomie inviate esclusivamente a `/seogrow/v1/atomic-write`, con `expectedCurrent`, modifiche, identità e operazione.
- Nessun retry o fallback alla REST WordPress standard; redirect rifiutati, timeout 20 secondi.
- Connector controlla operazione, permessi sulla risorsa, tipo post e snapshot obbligatorio. Legge direttamente post e meta dal database per il confronto diagnostico; differenze esatte restituiscono `STALE_CONFLICT`. Meta assenti/duplicati restano bloccati. Tassonomie usano il validatore esistente, senza scrittura successiva.
- In assenza di un adapter con confronto+scrittura realmente atomici restituisce `ATOMIC_WRITE_UNAVAILABLE`. Nessun UPDATE/INSERT/DELETE nell'endpoint.
- Vecchio endpoint taxonomy-write disabilitato dopo validazione, capability taxonomyWriteSingleField e atomicWriteGuaranteed false. Il ciclo Doctor già verificato resta distinto e invariato: non gli viene attribuita una garanzia atomica.
- Registro Correzioni distingue rifiuto dimostrato (`Bloccato`) e risposta persa, redirect o conferma incompleta (`Esito incerto`). Un record bloccato non offre rollback o riverifica di una scrittura inesistente.
- Una risposta di successo deve confermare atomicità, controllo stale, identità e valori raw richiesti: i soli flag non provano persistenza.

## Due passaggi di revisione e test

Primo passaggio: inventario delle route di mutazione, individuazione GET/check/POST, instradamento Connector e test apply/rollback con modifica esterna simulata dopo preflight. Replay del token consumato rifiutato.

Secondo passaggio: risposta 2xx incompleta inizialmente classificata come rifiuto senza scrittura; corretta in esito incerto. Aggiunti confronto meta, risposta con identità/valore errati, permessi e metadati duplicati/assenti. Controllati separatamente creazione nuova bozza (nessuna entità preesistente da sovrascrivere) e recovery Doctor; fuori dal protocollo CAS qui introdotto.

Test Node comportamentali: wordpressApplyConcurrency, wordpressAtomicWrite, residualRollback, correctionJournal. Test PHP isolato: scripts/test-atomic-write.php, con snapshot stale/matching, apply/rollback, meta e zero scritture. Il test PHP usa stub, non un database WordPress reale; viene eseguito dal Release Gate perché PHP non è disponibile localmente. Packaging controlla inclusione e hash dei moduli.

## Limiti e condizioni per riabilitare

| Punto | Stato |
|---|---|
| Fallback non atomico remediation/rollback | CORRETTO |
| Falso esito certo su risposta incompleta | CORRETTO |
| Writer atomico operativo | BLOCCATO |
| Concorrenza con editor/plugin su database reale | DA VERIFICARE SU SITO REALE |
| Rendering Elementor e invalidazione cache dopo salvataggio | DA VERIFICARE SU SITO REALE |

Per riabilitare occorre implementare e provare un adapter specifico per storage/ownership: CAS condizionale o transazione con lock effettivi, comportamento rispetto agli altri writer, side effect dei save hook, cache, rollback e risultato frontend. Un semplice UPDATE SQL condizionale non dimostra da solo il corretto salvataggio di un documento Elementor o degli indici di un plugin.

Impatto operativo deliberato: adottando questo backend, le remediation/rollback interessate saranno bloccate anche con Connector 1.3.1 (route assente). Non distribuire descrivendo questa versione come pienamente operativa nelle scritture. Nessuna modifica a contenuti WordPress reali. Workspace atomico del precedente step preservato. PR in bozza, merge e installazione non effettuati.
