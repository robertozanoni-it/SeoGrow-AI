# SeoGrow Guardian v1

SeoGrow Guardian è il control plane di affidabilità della Suite. **Non è un quindicesimo modulo prodotto** e non compare nella tassonomia congelata dei 14 moduli.

## Obiettivo

Rilevare anomalie della Suite, classificarle, applicare solo remediation locali e reversibili quando esiste una verifica deterministica, registrare l'incidente e mantenere separati gli interventi che possono modificare dati cliente o sistemi esterni.

## Ciclo operativo

1. **Observe** — eventi runtime, errori workspace, health API, drift di navigazione e segnali di riapertura anomala.
2. **Diagnose** — fingerprint stabile, severità, sorgente, rischio e azione proposta.
3. **Policy** — l'azione viene autorizzata solo se rientra negli scope locali ammessi.
4. **Remediate** — AutoFix v1 riguarda esclusivamente:
   - navigazione salvata invalida/legacy;
   - stato derivato Task ↔ Problemi ↔ Correzioni tramite il reconciler canonico;
   - ledger interno Guardian.
5. **Verify** — un incidente AutoFix viene chiuso solo dopo una rilettura o una riconciliazione canonica riuscita.
6. **Escalate** — scritture WordPress, modifica contenuti cliente e restore workspace restano fuori dall'AutoFix automatico.

## Livelli di rischio

| Livello | Significato | Azione automatica |
| --- | --- | --- |
| L0 | osservazione | no |
| L1 | diagnosi | no |
| L2 | AutoFix sicuro e reversibile | sì |
| L3 | approvazione richiesta | no |

## Guardrail v1

Guardian **non**:
- avvia audit SEO automaticamente;
- modifica WordPress;
- modifica contenuti cliente;
- esegue restore;
- aggira i gate di remediation già esistenti;
- aggiunge moduli alla sidebar.

Gli interventi esterni continuano a usare i workflow proprietari della Suite e le relative verifiche.

## Controlli v1

- invarianti dell'architettura congelata;
- validità della pagina/vista persistita;
- riconciliazione canonica dei task con cause e correzioni;
- health dell'API locale;
- errori JavaScript globali;
- promise rejection non gestite;
- errori di persistenza workspace;
- problema riaperto subito dopo una verifica, senza chiusura automatica.

## Incident ledger

Chiave workspace:

`seogrow-guardian-incidents-v1`

Ogni incidente contiene:
- fingerprint;
- codice e sorgente;
- severità e livello di rischio;
- stato;
- prima/ultima rilevazione;
- numero occorrenze;
- azione proposta;
- prova di verifica alla chiusura.

Gli incidenti equivalenti vengono deduplicati sul fingerprint.

## Console

La console è un overlay di sistema, non una pagina applicativa. Mostra:
- System Health;
- incidenti aperti;
- AutoFix risolti;
- casi da approvare;
- ultimo controllo;
- dettaglio sintetico degli incidenti.

## Gate di accettazione

Guardian v1 è accettabile quando:

1. i 14 moduli canonici restano esattamente 14;
2. Guardian non è registrato nella navigazione;
3. L2 può agire solo su scope locali esplicitamente consentiti;
4. WordPress/contenuti/restore sono sempre L3;
5. incidenti duplicati vengono unificati;
6. un AutoFix non risulta risolto senza verifica;
7. lint, test e build restano verdi;
8. l'app continua a funzionare se Guardian non trova incidenti;
9. Guardian rimane visibile anche quando il contenuto principale cade nell'Error Boundary.

## Estensioni successive

Dopo la v1, senza cambiare i guardrail:
- runbook firmati per classi di incidente ricorrenti;
- diagnosi OpenAI solo come supporto esplicativo, mai come autorizzazione alla scrittura;
- telemetria regressioni e trend;
- correlazione incidenti con commit/release;
- health specifico delle integrazioni;
- remediation server-side pre-validata;
- approval queue per L3.
