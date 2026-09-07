# G06 — WordPress lost-response recovery: live proof

Data prova: 7 settembre 2026 (Europe/London).

Ambiente applicazione: branch `audit/residual-review-20260906`; backend con capability `write-reconciliation-read-only` e modalità `read-only-exact-before-after-classification-core-fields`; Connector WordPress 1.3.3.

Fixture WordPress: pagina bozza tecnica ID `8188` su `https://yogabuenaonda.it/`, usata esclusivamente per il collaudo controllato. Nessuna pagina pubblicata o contenuto cliente è stato modificato durante la riconciliazione.

## Sequenza osservata

1. Stato iniziale del titolo: `SeoGrow Atomic CAS Test — 2026-09-06`.
2. Scrittura CAS core-field eseguita sulla bozza con titolo `SeoGrow Atomic CAS Test — G06 LOST RESPONSE`.
3. La risposta applicativa è stata trattata come persa/incerta e il journal locale è stato salvato con `status: "Esito incerto"` e `writeConfirmed: false`.
4. Durante il test è stato scoperto un difetto reale: il cleanup automatico delle correzioni poteva cancellare il journal quando la lista clienti al bootstrap era temporaneamente incompleta. Il listener distruttivo è stato rimosso; `purgeOrphanCorrections()` resta esplicito-only. Fix e test di regressione: HEAD `37ee2e56fd8442859f8a0116b62843a47b238122`.
5. Dopo il fix, due probe IndexedDB (`clientId: 1` e `clientId: 4`) sono sopravvissuti alla chiusura/riapertura della scheda sullo stesso origin `http://127.0.0.1:5176`.
6. Il journal `g06-live-8188` è stato ricreato dopo il fix e ha superato la stessa chiusura/riapertura.
7. Il backend è stato riavviato e la capability `write-reconciliation-read-only` è risultata presente.
8. La riconciliazione ha eseguito solo una lettura WordPress e ha confrontato lo stato remoto con gli snapshot `before`/`after`.
9. Risultato finale persistito nel journal: `status: "Da verificare"`, `writeConfirmed: true`, `reconciliation.classification: "APPLIED"`.

## Esito

**G06: PASS per il caso live testato su core field `title` di una `page`.**

Il criterio di chiusura è soddisfatto per questa classe: snapshot conservato, nessun retry cieco, riapertura dell'app, lettura remota in nuova sessione e classificazione esatta `APPLIED` senza nuova scrittura.

## Limiti della prova

- La prova certifica il percorso di recovery per `pages/posts` e soli campi core supportati `title`, `content`, `excerpt`; il caso eseguito live è `title`.
- Meta WordPress, Elementor, Rank Math/Yoast e tassonomie non sono inclusi e restano fail-closed/non certificati da G06.
- La prova non certifica ogni possibile errore di rete o proxy; certifica il caso concreto di risposta trattata come persa dopo commit remoto e successiva riconciliazione read-only.
- Il record finale resta `Da verificare` perché la conferma della scrittura remota non sostituisce l'eventuale verifica SEO/frontend prevista dal flusso applicativo.

CI collegata al fix di persistenza: Release Gate #616 (`34066900492`) completato con successo.