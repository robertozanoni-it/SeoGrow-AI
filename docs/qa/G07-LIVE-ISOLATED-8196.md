# Collaudo isolato live — pagina 8196

Sito: https://yogabuenaonda.it/. Pagina temporanea Elementor Canvas, stato finale draft, robots noindex/nofollow. Nessun template condiviso modificato.

Versioni osservate: Elementor 4.2.4, Elementor Pro 4.2.3, SeoGrow Connector 1.3.3, WPVibe 1.16.4.

## Prove reali

- Connector /seogrow/v1/atomic-write: modifica del solo titolo WordPress, atomicGuaranteed=true e staleChecked=true. Rilettura REST separata conferma il nuovo titolo.
- Rollback con expectedCurrent obsoleto: HTTP 409 STALE_CONFLICT, nessuna scrittura.
- Rollback con expectedCurrent corretto: riuscito. Rilettura separata conferma titolo iniziale e dati Elementor invariati.
- Modifica meta._elementor_data tramite Connector: HTTP 409 ATOMIC_WRITE_UNAVAILABLE. La scrittura Elementor protetta rimane indisponibile; nessun fallback usato per dichiarare superato questo test.
- Prova separata via pipeline nativa WPVibe /elementor/save-page: cambiato testo H1, salvataggio senza warnings, rilettura del markup autenticato conferma il nuovo testo. Ripristino tramite la stessa pipeline senza warnings.
- Rilettura finale: stringa _elementor_data identica byte per byte alla baseline; testo iniziale presente e testo modificato assente nel markup server-rendered.
- Impostazioni font conservate: Roboto, peso 600, 36px desktop e 26px mobile. Metadati CSS finali: status=file, fonts=[Roboto]. Questo NON certifica font effettivamente caricati, geometria o resa grafica nel browser.

## Evidenza finale

```json
{
  "elementorDataExact": true,
  "id": 8196,
  "renderedAfterAbsent": true,
  "renderedBefore": true,
  "robots": [
    "noindex",
    "nofollow"
  ],
  "status": "draft",
  "template": "elementor_canvas",
  "titleRestored": true
}
```

## Limiti e punto di ripresa

Il controllo automatico di approvazione ha rifiutato la pubblicazione temporanea perché ritenuta oltre il perimetro autorizzato della bozza. Nessun tentativo alternativo di pubblicazione. Pagina lasciata in bozza e ripristinata per proseguire dopo chiarimento dell’autorizzazione.

Nessuna prova grafica browser before/after/rollback, nessuna verifica della cache pubblica, nessuna prova shared/CPT. Le chiamate al Connector hanno usato l’autenticazione WPVibe, non il runtime e l’interfaccia dell’app SeoGrow; credenziali applicative assenti nel workspace. Il ciclo completo dell’app NON è chiuso; G07 resta PARTIAL.

## Continuazione dopo autorizzazione esplicita

L’utente ha autorizzato la pubblicazione temporanea della sola pagina 8196 con noindex/nofollow e il salvataggio di questo report nel repository. Pubblicazione riuscita; URL osservato: https://yogabuenaonda.it/seogrow-collaudo-isolato-2026-09-09/.

Ciclo nativo Elementor completato sulla pagina pubblicata: baseline → testo H1 modificato → ripristino. Salvataggi senza warnings, nessun purge globale richiesto. Screenshot acquisiti e ispezionati in conversazione per i tre stati desktop e mobile.

| Misura H1 | Desktop: prima/dopo/ripristino | Mobile: prima/dopo/ripristino |
| --- | --- | --- |
| Font CSS calcolato | Roboto, sans-serif | Roboto, sans-serif |
| Dimensione | 36px / 36px / 36px | 26px / 26px / 26px |
| Peso | 600 / 600 / 600 | 600 / 600 / 600 |
| Interlinea | 40.68px / 40.68px / 40.68px | 29.38px / 29.38px / 29.38px |
| Larghezza titolo | 1160px / 1160px / 1160px | 312px / 312px / 312px |
| Altezza titolo | 40.6875px / 40.6875px / 40.6875px | 58.75px / 58.75px / 58.75px |
| Viewport / scrollWidth | 1363 / 1363 in tutti gli stati | 360 / 360 in tutti gli stati |

Desktop: frontend in browser autenticato. Mobile: anteprima responsive dell’editor Elementor a 360px, dopo ricaricamento dei dati per ciascuno stato. Queste prove non costituiscono una matrice anonima su dispositivi fisici né una prova dell’asset font effettivamente scaricato: sono confronto visivo e misure CSS/DOM. Un tentativo di enumerare FontFaceSet non era supportato dallo strumento e non è usato come evidenza.

Il testo modificato è comparso nei due contesti e il testo iniziale è tornato dopo rollback. Non osservate regressioni nel titolo e nel paragrafo della fixture. La pagina usa solo il documento Elementor 8196 (Canvas); robots frontend nofollow/noindex verificati prima e dopo. Nessun template condiviso o pagina commerciale modificato.

Stato finale: draft, noindex/nofollow; titolo WordPress e stringa _elementor_data esattamente uguali alla baseline. Lettura HTML separata dell’URL dopo il ritiro restituisce la pagina error404 del sito. Pagina di test conservata in bozza.

**Esito limitato: PASS per il ciclo nativo Elementor sulla fixture indipendente e per il confronto desktop/mobile descritto. Il ciclo end-to-end SeoGrow → Elementor resta NON CHIUSO per ATOMIC_WRITE_UNAVAILABLE. G07 resta PARTIAL per shared/CPT/cache pubblica e copertura visuale complessiva.**

## Connector 1.3.5 installed — direct Connector cycle

User confirmed ZIP installation and authorized the isolated test. Active plugin inventory confirmed Connector 1.3.5 with Elementor 4.2.4. Page 8196 remained draft throughout this cycle, with Canvas and noindex/nofollow.

- Saved fresh REST baseline before mutation.
- Enabled `_seogrow_elementor_text_enabled=1` only on page 8196.
- POST `/seogrow/v1/atomic-write`, operation apply, changed heading from “versione iniziale” to “versione di prova”. Response ok=true, atomicGuaranteed=true, staleChecked=true. Independent REST reread matched target JSON exactly.
- Authenticated frontend preview showed the changed heading; Elementor mobile preview showed the changed heading. Screenshots inspected; no horizontal overflow observed.
- Rollback with outdated expectedCurrent returned HTTP 409 STALE_CONFLICT.
- Rollback with the actual applied snapshot returned success through the same Connector endpoint.
- Independent final REST reread: original Elementor JSON, raw post_content and raw page title matched baseline byte for byte. Draft, Canvas and noindex/nofollow retained.
- Temporary per-page enablement metadata deleted successfully after rollback. WPVibe automatically purged LiteSpeed/Elementor/object caches on its metadata enable/cleanup commands; cache behavior of the Connector alone is therefore not independently certified by this cycle.

| Observation | After apply | After rollback |
|---|---|---|
| Desktop heading font | Roboto, sans-serif; 36px; 600 | Same |
| Desktop line height / box | 40.68px; 1160 × 40.6875px | Same |
| Desktop viewport / scroll width | 1363 / 1363px | Same |
| Editor mobile heading font | Roboto, sans-serif; 26px; 600 | Same |
| Editor mobile line height / box | 29.38px; 312 × 58.75px | Same |
| Editor mobile viewport / scroll width | 360 / 360px | Same |

Scope: direct authenticated Connector test via WPVibe plus browser rendering verification. This was NOT the SeoGrow application approval-token/button/runtime authentication path. That end-to-end gate remains open. No shared templates, production content pages, anonymous cache matrix, or font asset inventory were certified. Connector remains installed; isolated opt-in was removed.


## Ciclo dalla UI SeoGrow — 9 settembre 2026

Roberto ha eseguito la preparazione, applicazione e il ripristino dalla UI del branch `feat/elementor-protected-text-save`, pagina isolata 8196. La schermata delle 01:29 mostra il salvataggio; quella delle 01:40 mostra `Ripristinato`, zero da verificare e un ripristino. Lettura REST indipendente dopo applicazione: titolo Elementor “Collaudo SeoGrow — versione di prova”; anteprima autenticata desktop aperta e osservata. Lettura REST dopo rollback: “Collaudo SeoGrow — versione iniziale”, draft, Canvas, noindex/nofollow, impostazioni tipografiche e struttura originali. Il flag `_seogrow_elementor_text_enabled` è stato rimosso dalla sola pagina 8196 dopo il rollback (esito riuscito). La rimozione tramite WPVibe ha anche svuotato le cache automaticamente.

Questa evidenza chiude applicazione e ripristino dalla UI sulla pagina isolata. Non costituisce una nuova verifica visuale mobile dopo questo specifico ciclo, né una certificazione dei template condivisi o di ogni modifica Elementor.
