# UX/UI finale — Gate 2026-09-17

## Scope

Step 17 congela le feature e consolida soltanto la presentazione finale della suite.

Il Gate copre:

- sidebar definitiva e stato attivo coerente;
- azzurro chiaro usato come tinta di raggruppamento, non come stato attivo;
- gerarchia visiva e spaziature;
- responsive;
- empty state;
- loading state;
- error/status state;
- CTA e focus coerenti;
- linguaggio comprensibile e aderente alle capacità reali dei moduli.

## Contratto visivo finale

`FinalUxContract.css` è caricato dopo tutti i precedenti fogli `Reference`, `SemanticVisualSystem` e `SidebarContrastFinal`.

Decisioni finali:

1. gruppi sidebar alternati `#78b8f5` / `#cfe6fb`;
2. pagina attiva rossa `#d92d20`, con testo/icona bianchi;
3. focus tastiera sempre visibile;
4. controlli disabilitati distinguibili;
5. errori, status, empty e loading hanno semantica visiva coerente;
6. tabelle e contenuti larghi scorrono su viewport piccole invece di comprimere o sovrapporre contenuti;
7. CTA possono andare a capo su mobile e non devono uscire dal contenitore.

## Contratto semantico

`FinalUxSemantics.js` non modifica dati o workflow. Normalizza soltanto la presentazione:

- `role=alert` → stato errore;
- `role=status` → stato informativo;
- `progress` / `aria-busy=true` → loading;
- empty/no-data/no-results/blocking-state → empty state;
- pulsanti disabilitati con testo di operazione in corso → `aria-busy=true`.

## Chiarezza Agent/GEO

Le guide contestuali legacy vengono riallineate al contratto reale:

- SEO Agent: read-only, analisi → proposta → handoff a Task/Correzioni;
- GEO AI: prove osservabili, diagnostica OpenAI sul contesto, osservazione Google DataForSEO, nessun punteggio GEO sintetico o dichiarazione di presenza reale nei motori AI.

## Gate

PASS soltanto se:

- una sola voce sidebar è attiva e usa `aria-current=page`;
- il contratto finale viene caricato per ultimo;
- active state non usa l'azzurro chiaro;
- focus/disabled/error/status/empty/loading sono distinguibili;
- Agent/GEO non mostrano guide che promettono capacità eliminate;
- layout responsive non produce CTA o tabelle tagliate;
- Release Gate completa resta verde su Ubuntu e macOS.
