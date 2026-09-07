# Protezione concorrenza WordPress — 2026-09-06

Stato: CAS atomico implementato per i soli campi core `title`, `content`, `excerpt` di post/pagine; meta e tassonomie restano fail-closed. Non ancora installato o validato su un sito WordPress reale.

## Causa e impatto

Le route live-apply/live-rollback facevano GET, confronto, POST REST separati. Il writer tassonomia controllava il valore prima di invocare il salvataggio del plugin. Una modifica esterna poteva inserirsi dopo il confronto ed essere sovrascritta. Il controllo del solo server e un lock cooperativo SeoGrow non proteggono dalle scritture di editor, plugin o altri client.

## Modifica

- Scritture di remediation e rollback vengono inviate esclusivamente a `/seogrow/v1/atomic-write`, con `expectedCurrent`, modifiche, identità e operazione.
- Nessun retry o fallback alla REST WordPress standard; redirect rifiutati, timeout 20 secondi.
- Per `posts`/`pages` e soli campi core `title`, `content`, `excerpt`, il Connector esegue una singola `UPDATE wp_posts ... WHERE ...` che contiene nella stessa istruzione sia i nuovi valori sia tutte le precondizioni `expectedCurrent`.
- Le precondizioni SQL usano confronto `BINARY`, quindi il CAS è byte-exact anche con collation case-insensitive. `ID` e `post_type` fanno parte del predicato; l'UPDATE deve modificare esattamente una riga.
- Dopo l'UPDATE viene invalidata la post cache e viene riletta direttamente la riga. Una risposta di successo contiene `atomicGuaranteed: true`, `staleChecked: true`, identità e valori raw effettivamente riletti. Se la rilettura non coincide, l'esito resta `ATOMIC_RESULT_UNVERIFIED`.
- Se il predicato non coincide, nessuna sovrascrittura viene eseguita e viene restituito `STALE_CONFLICT`.
- `meta` resta bloccato con `ATOMIC_WRITE_UNAVAILABLE`, anche se mescolato a campi core: non è consentita una scrittura parzialmente atomica. Questo include `_elementor_data`, Rank Math e Yoast meta.
- Le tassonomie restano fail-closed: il validatore controlla identità, ownership e snapshot, ma non segue alcuna scrittura finché non esiste un CAS dimostrabile per lo storage del plugin.
- Vecchio endpoint taxonomy-write resta disabilitato dopo validazione; il ciclo Doctor già verificato resta distinto e non riceve una garanzia atomica retroattiva.
- Registro Correzioni distingue rifiuto dimostrato (`Bloccato`) e risposta persa, redirect o conferma incompleta (`Esito incerto`).

## Proprietà del CAS core

La garanzia implementata è limitata alla singola riga `wp_posts`:

1. il server prepara `changes` ed `expectedCurrent` dall'anteprima;
2. il Connector ricontrolla identità e permessi;
3. una sola istruzione SQL esegue confronto e aggiornamento;
4. un writer concorrente che modifica uno dei campi attesi prima dell'UPDATE fa fallire il predicato e produce `STALE_CONFLICT`;
5. nessuna sequenza GET/check/POST viene usata come prova di atomicità;
6. risultato 0, >1, errore DB o rilettura incoerente non vengono trasformati in successo.

Questo CAS non usa `wp_update_post`: la chiamata WordPress standard non espone una precondizione compare-and-swap. Di conseguenza i normali hook `save_post` non sono parte della scrittura SQL. `clean_post_cache()` viene eseguito dopo il successo, ma gli effetti di plugin che dipendono dai save hook devono essere collaudati separatamente prima di dichiarare questo percorso adatto a qualunque integrazione.

## Test

Test PHP isolato `scripts/test-atomic-write.php`:

- apply e rollback core riusciti;
- CAS multi-campo sulla stessa riga;
- confronto case-sensitive/byte-exact;
- stale precondition senza UPDATE;
- meta/mixed write bloccati senza scrittura parziale;
- errore DB classificato come esito non verificato;
- permessi insufficienti bloccati;
- invalidazione cache dopo successo.

Test Node `wordpressAtomicWrite.test.js` verifica inoltre che un successo venga accettato solo con `atomicGuaranteed`, `staleChecked`, identità corretta e valori raw uguali a quelli richiesti; redirect, risposte incomplete e route assente restano fail-closed.

## Stato di rilascio

| Punto | Stato |
|---|---|
| Fallback non atomico remediation/rollback | CORRETTO |
| Falso esito certo su risposta incompleta | CORRETTO |
| CAS core post/page (`title`, `content`, `excerpt`) | IMPLEMENTATO, DA VALIDARE SU WORDPRESS REALE |
| Meta WordPress / Elementor / plugin SEO | BLOCCATO FAIL-CLOSED |
| Tassonomie | BLOCCATO FAIL-CLOSED |
| Concorrenza con editor/plugin su database reale | DA VERIFICARE SU SITO REALE |
| Cache e side effect plugin dopo SQL CAS | DA VERIFICARE SU SITO REALE |

La PR resta in bozza. Non dichiarare ancora operative in produzione le scritture live: il prossimo gate è un collaudo controllato su un post/pagina reale con backup, modifica concorrente intenzionale, apply, rollback, verifica frontend e verifica che plugin/cache non rimangano incoerenti. Nessuna modifica a contenuti WordPress reali è stata eseguita durante questa implementazione.
