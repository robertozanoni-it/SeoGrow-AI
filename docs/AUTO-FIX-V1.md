# Auto Fix v1 — modalità assistita

Il Centro progetto espone **Analizza e correggi**. Il pulsante classifica i problemi
dell'ultimo audit pagina/sito salvato per il progetto selezionato. Non avvia una
nuova scansione remota. La data della fonte è visibile; in assenza di un audit
salvato viene richiesto di eseguirne uno.

## Comportamento

- Selezione esplicita di massimo 10 problemi. Nessuna selezione predefinita.
- Title, description, H1, contenuti ed estratto sono candidati a una proposta,
  non dichiarati automaticamente scrivibili o sicuri.
- Canonical, robots/indexability, redirect, sitemap, tassonomie, Elementor
  esplicito, cambi strutturali, destinazioni esterne e tipi sconosciuti restano manuali.
- Il controllo WordPress V2 esistente prepara le anteprime selezionate nel
  Centro progetto. Ownership, qualità editoriale, adapter e guardie del server
  restano obbligatori. Le credenziali non vengono persistite nel piano.
- Ogni modifica richiede approvazione singola con Prima/Dopo. La preparazione
  non applica alcuna modifica. Il limite vale anche per la preparazione massiva
  già presente in Audit SEO.
- Un piano è vincolato al cliente e all'intero audit serializzato: una modifica
  anche a parità di timestamp invalida preparazione e applicazione.
- Doppio clic su preparazione/applicazione bloccato prima delle attese asincrone.
- Cronologia e ripristino apre Correzioni, dove restano i controlli già presenti.

## Snapshot, verifica e limiti

La scrittura usa `applyJournaledCorrection`: lo snapshot viene committato prima
della richiesta remota. Una risposta persa resta **Esito incerto**, una scrittura
confermata resta **Da verificare**. Questa versione non introduce applicazioni
autonome, verifica SEO automatica completa o rollback ciechi. Un ripristino deve
rispettare le guardie di concorrenza già esistenti.

La diagnostica locale segnala ID task duplicati nel progetto e riferimenti a
progetti mancanti nell'intero workspace. Non elimina, fonde né modifica task.
Non certifica tutte le dipendenze opportunità/task né corregge bug del codice.

Nessun sblocco delle scritture Elementor shared e nessuna operazione su siti reali
durante lo sviluppo. Il precedente limite WPVibe/G07 resta indipendente.

## Collaudo

`autoFixPlan.test.js` verifica rischio, URL, isolamento cliente, fingerprint,
limite, indici invalidi e diagnostica senza mutazioni. Il caso browser obbligatorio
`AUTO-FIX-ASSISTED` usa React e IndexedDB reali con risposte WordPress simulate:
selezione, limite 10, mancanza credenziali, doppio clic, errore e retry con
anteprime approvabili, nessuna richiesta apply/rollback e invalidazione audit.
Include catture desktop/mobile e controllo overflow.

Il test storico sull'host è aggiornato per il nuovo parametro `initialAudit`
(predefinito null); restano le verifiche di selezione esatta e assenza di fallback.
