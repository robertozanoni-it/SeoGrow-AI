# G07 — Elementor live read-only inventory

Data prova: 7 settembre 2026 (Europe/London).

Ambiente: branch `audit/residual-review-20260906`; sito reale `https://yogabuenaonda.it/`; Connector installato 1.3.3. Tutte le operazioni di questa prova sono state di sola lettura. Nessun documento Elementor è stato modificato o salvato.

## Obiettivo

Ridurre il gap G07 raccogliendo evidenza reale sulle classi Elementor già presenti, sull'ownership e sul comportamento fail-closed prima di qualunque prova di scrittura/rendering/cache.

## Evidenza raccolta

### Template Library

Inventario `elementor_library` osservato con `_elementor_template_type`:

- header: ID 185 — `Ultimate You – Header`;
- footer: ID 327 — `Ultimate You – Footer`;
- archive: ID 584 — `Ultimate You – Blog`;
- single-post: ID 598 — `Ultimate You – Blog Single`;
- reusable section: ID 2789 — `New single post Ok`;
- page templates: presenti più documenti;
- error-404: presenti più documenti;
- kit: presenti ID 6 e 9.

Non è stato trovato alcun template con `template_type=widget`, quindi non esiste sul sito una fixture reale di global widget utilizzabile per chiudere quella classe.

### Ownership / impact connector

La route autenticata read-only `/seogrow/v1/elementor-impact-inspect` ha riconosciuto correttamente:

- ID 185 → `header`, condizioni `include/general`;
- ID 327 → `footer`, condizioni `include/general`;
- ID 584 → `archive`, condizioni `include/archive`;
- ID 598 → `single-post`, condizioni `include/singular/post`;
- ID 2789 → `section`, senza condizioni globali osservate.

Per tutte queste entità il Connector ha restituito `readOnly: true` e `sharedWriteAllowed: false`.

Gli ID 6071 (`e-floating-buttons`) e 6028 (`rm_content_editor`) sono stati correttamente rifiutati dall'endpoint come non appartenenti a `elementor_library`, quindi non vengono assimilati impropriamente a template condivisi.

### Inventario pubblico

`/seogrow/v1/wordpress-public-inventory` ha restituito inventario completo/non troncato per il perimetro pubblico interrogabile e mantiene `sharedWriteAllowed: false`.

Nota diagnostica: l'endpoint riporta `connectorVersion: 1.3.2` mentre il pacchetto installato ha header plugin 1.3.3. È una discrepanza di versione interna già nota da trattare separatamente; non cambia l'esito read-only di questa prova.

### HTML / script / CSS

Nel dataset Elementor reale sono presenti widget HTML e markup `<script>` su varie pagine/post; anche il footer ID 327 contiene un widget HTML. Questo fornisce fixture reali utili per l'ispezione di impatto.

Non è stata trovata, tramite `_elementor_page_settings`, una fixture evidente con `custom_css` nel campione interrogato.

`elementor_snippet` non contiene documenti. Esiste invece un draft `e-floating-buttons` (ID 6071), ma non è una fixture `elementor_library` e non viene trattato come tale dal Connector.

## Esito

**G07: PARZIALMENTE COPERTO / NON CHIUSO.**

La parte read-only di inventory/ownership è verificata su classi reali header, footer, archive, single-post e reusable section. Il fail-closed per entità non `elementor_library` è stato osservato correttamente.

G07 non può essere marcato PASS perché il criterio completo richiede anche fixture e prove che sul sito reale non sono disponibili o non è sicuro modificare:

- global widget reale;
- fixture custom CSS dedicata;
- fixture script/HTML controllata e sacrificabile;
- CPT Elementor rappresentativo;
- salvataggio documento tramite percorso Elementor ufficiale;
- rigenerazione cache/CSS;
- confronto rendering prima/dopo;
- verifica che template condivisi impattino solo le pagine di ownership prevista;
- rollback completo della fixture.

Queste prove devono essere eseguite su staging/clone isolato, non sul sito di produzione.

## Decisione di sicurezza

Nessuna estensione delle scritture Elementor è autorizzata sulla base di questa prova. `sharedWriteAllowed:false` resta la postura corretta fino alla chiusura delle fixture mancanti e del collaudo save/render/cache.