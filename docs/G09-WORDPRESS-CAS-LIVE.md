# G09 — WordPress CAS live validation

Data: 2026-09-07

## Esito

**PASS per campi core `title`, `content`, `excerpt` di `posts/pages`.**

Il collaudo è stato eseguito su una pagina tecnica in bozza del sito Yoga Buena Onda, senza pubblicazione e senza toccare contenuti esistenti.

- Sito: `https://yogabuenaonda.it`
- WordPress: 7.0.4
- PHP: 8.2.33
- Database: MariaDB 11.8.8
- Connector: SeoGrow Connector 1.3.3
- Pagina tecnica: ID 8188
- Stato pagina: `draft`
- Titolo baseline: `SeoGrow Atomic CAS Test — 2026-09-06`

## Sequenza eseguita

1. Verificata installazione attiva del Connector 1.3.3 e presenza della route `/seogrow/v1/atomic-write`.
2. Verificata baseline della pagina tecnica 8188 tramite REST con `context=edit`.
3. Eseguito CAS `apply` con:
   - `resource: pages`
   - `id: 8188`
   - `expectedCurrent.title` uguale al titolo baseline
   - `changes.title = SeoGrow Atomic CAS Test — CAS OK`
4. Il Connector ha risposto con:
   - `ok: true`
   - `atomicGuaranteed: true`
   - `staleChecked: true`
   - `noWriteRequired: false`
5. Simulata modifica esterna legittima fuori da SeoGrow, impostando il titolo a `SeoGrow Atomic CAS Test — EXTERNAL CHANGE`.
6. Eseguito un nuovo CAS usando lo snapshot precedente: il Connector ha restituito `409 STALE_CONFLICT`.
7. Riletta la pagina: la modifica esterna era ancora presente, quindi SeoGrow non l'ha sovrascritta.
8. Eseguito rollback atomico con `expectedCurrent` uguale allo stato corrente esterno e `changes.title` uguale al titolo baseline.
9. Il rollback ha restituito `ok: true`, `atomicGuaranteed: true`, `staleChecked: true`.
10. Rilettura finale REST: titolo baseline ripristinato; contenuto ed excerpt invariati; pagina ancora `draft`.

## Criteri verificati

| Criterio | Esito |
|---|---|
| Apply con snapshot matching | PASS |
| Confronto byte-exact sul campo core | PASS |
| Modifica esterna dopo baseline | PASS |
| Patch stale rifiutata | PASS |
| Nessuna sovrascrittura della modifica esterna | PASS |
| Rollback con snapshot corrente matching | PASS |
| Rilettura finale coerente | PASS |
| Pagina rimasta non pubblica | PASS |

## Perimetro certificato

La prova certifica il CAS single-row del Connector 1.3.3 esclusivamente per i campi core memorizzati in `wp_posts`:

- `title`
- `content`
- `excerpt`

Non certifica e non abilita automaticamente:

- meta WordPress;
- `_elementor_data`;
- meta Rank Math/Yoast;
- tassonomie;
- documenti/template Elementor condivisi;
- side effect di `save_post` o hook/plugin che non vengono eseguiti da un `UPDATE` SQL diretto.

Queste classi restano fail-closed o richiedono collaudi separati.

## Decisione QA

- G04 può essere considerato **chiuso limitatamente al writer core posts/pages**.
- G05 può essere considerato **PASS per il caso reale testato di conflitto esterno su campo core**.
- Restano aperti recovery da risposta persa, side effect/hook/cache e storage meta/taxonomy/Elementor.
- Nessun merge automatico della PR #35 è autorizzato da questa prova.
