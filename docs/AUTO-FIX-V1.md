# AutoFix — single, batch e verifica obbligatoria

AutoFix è il percorso di mutazione della suite. Audit SEO rileva e documenta il problema; AutoFix prepara e applica soltanto correzioni con ownership e writer supportati; Correzioni conserva Prima/Dopo, receipt, verifica e rollback.

## Single fix

- Il problema viene risolto dal flusso canonico Problema → Correzione.
- La preparazione è read-only e mostra Prima/Dopo prima dell'approvazione.
- `applyJournaledCorrection` salva il journal prima della richiesta remota.
- Una scrittura confermata resta **Da verificare**.
- Dopo `seogrow-remediation-applied`, AutoFix avvia automaticamente riverifica frontend e audit di conferma quando la sessione WordPress è ancora disponibile.
- Un fix live può diventare **Verificato** solo con scrittura confermata, frontend confermato e audit post-fix che copre la sorgente e non rileva più il finding originale.

## Batch fix

- Massimo 10 problemi per piano.
- Preflight, target, ownership e snapshot vengono fissati prima dell'approvazione.
- L'approvazione è legata al fingerprint esatto del piano; ogni modifica del piano richiede nuove anteprime.
- Le operazioni ad alto rischio richiedono conferma esplicita.
- Le write vengono journaled prima dell'invio e sono eseguite in ordine deterministico.
- `SUCCESS` è ammesso solo quando tutti i problemi selezionati sono `RESOLVED_VERIFIED`.
- Interventi assistiti, fix applicati ma non verificati, stale conflict o errori non possono produrre uno stato di completamento.

## Shared Elementor writer

Il writer shared Elementor certificato nell'issue #163 è disponibile per i broken external link quando il preflight locale dimostra che il link appartiene a un template condiviso.

Il percorso richiede:

1. singola occorrenza verificabile sulla pagina sorgente;
2. coverage completa del sito e singolo template shared proprietario;
3. preview con approval token monouso;
4. conferma esplicita high-risk;
5. writer CAS atomico con stale check;
6. verifica frontend di tutte le URL impattate;
7. rollback automatico del writer se la verifica frontend fallisce;
8. audit di conferma post-fix prima dello stato finale `Verificato`.

Il kill switch `SEOGROW_ELEMENTOR_SHARED_WRITES_ENABLED` resta **OFF di default**. La certificazione dimostra la sicurezza del writer nel perimetro validato; l'abilitazione di un ambiente resta una scelta esplicita.

## Rollback e stale conflict

- Il rollback usa lo snapshot `after` come `expectedCurrent`: se WordPress è cambiato, il rollback viene bloccato invece di sovrascrivere modifiche esterne.
- Il writer shared Elementor applica lo stesso principio CAS sia in apply sia in rollback.
- `STALE_CONFLICT`, `STALE_PREVIEW`, approval scaduta, writer shared disabilitato e rollback automatico già eseguito sono classificati come blocchi con esito noto, non come scritture incerte.
- Una risposta remota realmente persa dopo l'invio resta invece **Esito incerto** e non viene ritentata automaticamente.

## Audit di conferma

`runConfirmationAudit()` salva l'audit post-fix nello storico progetto. Usa:

- audit pagina per finding locali;
- audit sito per duplicati e broken link, perché la conferma deve avere lo stesso perimetro necessario a dimostrare l'assenza del problema;
- verifica frontend puntuale come fallback solo nei casi esplicitamente supportati, ad esempio canonical.

Un audit che non copre la pagina interessata o che rileva ancora il finding lascia la correzione **Da verificare**.

## Gate

**Nessun fix live può risultare completato senza verifica.**

Per i fix con scrittura, `Verificato` richiede contemporaneamente:

- `writeConfirmed === true`;
- `frontendConfirmed === true`;
- `verifiedAt` reale;
- audit di conferma risolto oppure una prova batch equivalente basata su un vero audit post-fix.

Una semplice risposta API di apply, una scansione link isolata, una task assistita o uno status scritto dalla UI non soddisfano il gate.
