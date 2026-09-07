# G13 — WordPress role E2E runbook

Questo runbook serve a chiudere in modo ripetibile il residuo G13: verifica autenticata ruolo-per-ruolo sul runtime SeoGrow, senza creare utenti automaticamente e senza effettuare write salvo consenso esplicito.

## Matrice minima

Ruoli:
- Administrator: connection-check PASS, inspect-fast PASS, live-preview PASS.
- Editor: connection-check PASS, inspect-fast PASS, live-preview PASS.
- Subscriber: connection-check PASS, inspect-fast FAIL, live-preview FAIL.

La modalità predefinita non esegue `live-apply`. La scrittura viene abilitata soltanto con `SEOGROW_ROLE_E2E_ALLOW_WRITES=YES_I_UNDERSTAND` e va usata esclusivamente su staging/clone o su una fixture temporanea esplicitamente autorizzata.

## Variabili richieste

```bash
export SEOGROW_APP_URL="http://127.0.0.1:8787"
export SEOGROW_WP_SITE_URL="https://staging.example.com/"
export SEOGROW_WP_ROLE_E2E_TARGET_URL="https://staging.example.com/seogrow-role-e2e/"
export SEOGROW_WP_ROLE_E2E_TARGET_ID="123"
export SEOGROW_WP_ROLE_E2E_RESOURCE="pages"

export SEOGROW_WP_ADMIN_USERNAME="..."
export SEOGROW_WP_ADMIN_APPLICATION_PASSWORD="..."
export SEOGROW_WP_EDITOR_USERNAME="..."
export SEOGROW_WP_EDITOR_APPLICATION_PASSWORD="..."
export SEOGROW_WP_SUBSCRIBER_USERNAME="..."
export SEOGROW_WP_SUBSCRIBER_APPLICATION_PASSWORD="..."
```

## Esecuzione read-only

Avvia SeoGrow, poi:

```bash
npm run test:wordpress-role-e2e
```

Il test richiede almeno due ruoli configurati. Per chiudere G13 al 100% vanno comunque eseguiti tutti e tre i ruoli della matrice minima.

## Write opzionale

Solo su ambiente controllato e dopo backup:

```bash
export SEOGROW_ROLE_E2E_ALLOW_WRITES=YES_I_UNDERSTAND
npm run test:wordpress-role-e2e
```

Il target deve essere una pagina/post temporaneo dedicato. Dopo il test verificare manualmente il contenuto e ripristinare/eliminare la fixture.

## Criterio di chiusura G13

G13 può essere marcato `PASS` soltanto se:
1. tutti e tre i ruoli sono stati eseguiti;
2. gli esiti rispettano la matrice prevista;
3. se viene provato `live-apply`, la scrittura avviene solo per ruoli autorizzati e su fixture controllata;
4. le credenziali/app password temporanee vengono revocate o eliminate dopo il test;
5. il log JSON del test viene allegato alla documentazione di collaudo.

Fino a quel momento G13 resta `sostanzialmente chiuso / non esaustivo`.
