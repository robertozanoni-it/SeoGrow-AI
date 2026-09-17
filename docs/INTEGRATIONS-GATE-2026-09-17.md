# Integrazioni — Gate 2026-09-17

## Scope

La pagina Integrazioni espone un registro canonico per il progetto attivo con quattro tipi supportati:

- WordPress;
- OpenAI;
- DataForSEO;
- Google/Search Console.

## Ownership delle configurazioni

- **WordPress**: configurazione per progetto. URL e username possono essere persistiti come profilo non segreto; la password applicativa resta esclusivamente nella sessione transitoria centralizzata `wordpressSession`.
- **Search Console**: associazione per progetto tramite proprietà Google compatibile e/o dataset importato nel workspace del progetto.
- **OpenAI**: provider runtime condiviso. La API key non viene copiata nel workspace progetto.
- **DataForSEO**: provider runtime condiviso. Login/password non vengono copiati nel workspace progetto.

I moduli devono consumare questi stessi boundary; non devono introdurre una propria copia delle credenziali.

## Test connessioni

`Verifica tutte` usa gli endpoint reali disponibili:

- `/api/wordpress/test` quando esiste una sessione WordPress verificabile;
- `/api/openai/status`;
- `/api/dataforseo/status`;
- `/api/google/status`;
- `/api/google/properties`.

Gli errori vengono attribuiti al provider che li ha generati e mostrati in testo leggibile.

## Gate

PASS soltanto se:

1. il registro contiene una sola entry logica per ciascuna integrazione supportata;
2. WordPress non persiste `applicationPassword` nel workspace;
3. OpenAI/DataForSEO sono rappresentati come provider runtime condivisi e non come segreti duplicati per cliente;
4. Search Console è associata al progetto e non a una configurazione globale ambigua;
5. la pagina Integrazioni offre un test esplicito dello stato delle connessioni;
6. i consumer WordPress continuano a usare `getWordPressSession` dal System domain;
7. nessun nuovo storage segreto viene introdotto.
