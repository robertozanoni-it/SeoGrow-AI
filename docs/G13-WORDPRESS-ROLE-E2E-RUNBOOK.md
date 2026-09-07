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
export APP_API_TOKEN="..."
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

Avvia SeoGrow e usa il suo stesso `APP_API_TOKEN` (se non impostato all'avvio, il token persistente locale è in `.seogrow-data/app-token`). Non pubblicare il token o le password nei log. Il launcher richiede il token prima di inviare richieste e non segue redirect delle API locali. Poi:

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

## Batch assistito autorizzato per Yoga Buena Onda staging

`scripts/wordpress-role-staging-batch.mjs` è un wrapper specifico per `https://staging.yogabuenaonda.it`, con conferma obbligatoria `SEOGROW_ROLE_BATCH_CONFIRM_HOST=staging.yogabuenaonda.it`. Usarlo solo dopo consenso alla creazione ed eliminazione di `seogrow-qa-editor` e `seogrow-qa-subscriber`. Il consenso è stato acquisito nella sessione del 2026-09-07; non implica consenso su altri siti.

Richiede il runtime locale su 8787 e `SEOGROW_WP_ADMIN_USERNAME` / `SEOGROW_WP_ADMIN_APPLICATION_PASSWORD` già caricati nella stessa shell. Legge il token persistente usato da AVVIA.command. Non registra credenziali nei report.

```bash
SEOGROW_ROLE_BATCH_CONFIRM_HOST=staging.yogabuenaonda.it node scripts/wordpress-role-staging-batch.mjs
```

Il wrapper sceglie un post pubblicato esistente dello staging, crea soltanto i due account di prova con password casuali e relative password applicative, esegue l'harness G13 sui tre ruoli con write forzatamente disabilitate, quindi elimina gli account creati (e le loro credenziali). Le chiamate WordPress REST sono pinned; nessun POST di contenuti/template. In caso di identità cambiata non elimina l'account e segnala pulizia pendente. Non aggiorna né riutilizza utenti omonimi preesistenti.

Un report locale in `.qa-runtime/role-staging-<uuid>.json` registra anche le intenzioni prima della creazione. In caso di crash o risposta di creazione persa, verificare `pendingAccounts` sullo staging prima di un nuovo tentativo; nessun retry automatico della creazione. La pulizia è tentata anche dopo un fallimento dell'harness, ma un errore di rete o un arresto forzato può richiedere intervento manuale. La password applicativa dell'amministratore resta valida e deve essere revocata dal profilo staging al termine del collaudo.
