# SeoGrow Suite — residual release readiness (2026-09-16)

Questo documento registra soltanto i blocker ancora non dimostrati sul main corrente. Non riapre i gate storici già chiusi e non certifica prove live non eseguite.

## Baseline

- PR #35: già mergiata; writer WordPress core, stale conflict, rollback e lost-response recovery sono baseline storica del progetto.
- Elementor isolato: adapter protetto e ciclo apply/rollback su pagina Canvas isolata già coperti dalle evidenze successive.
- Browser/UI: esistono release gate successivi con suite browser, responsive e visual checks. Non equivalgono a una certificazione WordPress live universale.

## Blocker residui

### R1 — provider boundary

**Stato:** chiuso da questo branch, soggetto a CI.

Vincolo di prodotto: provider esterni supportati soltanto OpenAI e DataForSEO.

Criteri:
- l'AI usa esclusivamente `https://api.openai.com/v1`;
- endpoint OpenRouter, proxy locali e host arbitrari sono rifiutati fail-closed;
- DataForSEO resta separato e invariato;
- nessuna modifica all'architettura di budget o ai consumer OpenAI esistenti.

### R2 — Elementor shared/Theme Builder live validation

**Stato:** non certificato live dal presente branch.

L'implementazione esistente possiede già: ownership deterministica, coverage, approval esplicita, CAS su `_elementor_data`, verifica frontend, stale-safe rollback e auto-rollback su verifica fallita.

Per dichiarare supportata in produzione la scrittura su template condivisi serve una prova controllata su clone/staging o fixture sacrificabile reale:

1. snapshot esatto del template;
2. impact enumeration completa;
3. preview e approval esplicita;
4. apply tramite SeoGrow;
5. verifica frontend di tutte le URL impattate;
6. prova concorrente: edit esterno tra preview e apply deve produrre stale conflict senza sovrascrittura;
7. rollback tramite SeoGrow;
8. rilettura finale e confronto snapshot;
9. screenshot desktop/mobile before → after → rollback.

Fino a tale evidenza, non descrivere questa classe come universalmente certificata. I casi ambigui o non attestabili devono restare fail-closed.

### R3 — visual E2E live ad alto rischio

**Stato:** non sostituito dai browser test con upstream sintetico.

Non serve un nuovo audit UI globale. Il gate residuo è un solo percorso reale:

`Problema → Proposta → Preview → Approva → Apply → frontend reale → Riverifica → Rollback → frontend ripristinato`

Controllare desktop e mobile, layout, font, spacing, widget adiacenti e assenza di perdita contenuti.

## Regola GO

Nessun GO basato soltanto su implementazione o test sintetici.

Il candidate può essere dichiarato pronto soltanto quando:
- il release gate del commit candidate è verde;
- il Connector package del commit candidate è verde;
- il provider boundary resta OpenAI + DataForSEO only;
- ogni capability live dichiarata supportata dispone dell'evidenza reale pertinente;
- eventuali capability non validate sono esplicitamente fuori scope/fail-closed e non vengono presentate come certificate.

Non sono richiesti refactor architetturali, nuovi provider o un nuovo audit generale per chiudere questi punti.
