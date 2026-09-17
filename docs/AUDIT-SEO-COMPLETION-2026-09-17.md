# Audit SEO completion — 2026-09-17

## Scope

Audit SEO resta il modulo canonico per osservare, classificare e verificare problemi tecnici. Le scritture restano di proprietà di Correzioni.

## Copertura

- audit pagina: `/api/audit` + osservazione frontend `/api/frontend/inspect` per H2, robots/noindex e canonical count;
- audit sito: `/api/site-analysis` con crawl, robots, sitemap, link interni/esterni e status HTTP;
- progress: `/api/analysis-progress/:id`, alimentato dal server con contatori reali `done/total`;
- pagine GDPR/legal: escluse da problemi SEO, score e correzioni;
- segnali: title, meta description, H1, H2 (pagina), canonical, noindex, link interni/esterni e 404/410;
- deduplica issue: tipo + URL sorgente + URL target + label;
- severità: `alta`, `media`, `bassa` normalizzate;
- CTA operativa: `Vai alla risoluzione` per problemi correggibili.

## Evidence gate

Ogni issue mostrata deve avere:

1. URL sorgente;
2. tipo di sorgente (`HTML pubblico` oppure `HTTP/crawl`);
3. campo osservato;
4. valore osservato;
5. timestamp quando disponibile;
6. identità deterministica per deduplica.

Un 404/410 osservato come failure di crawl diventa una issue HTTP esplicita. I segnali noindex restano da confermare perché possono essere intenzionali.

## Regole anti-falso-positivo

- canonical/noindex non autorizzano automaticamente una scrittura;
- errori link temporanei non vengono promossi a 404 confermati dal normalizzatore sito;
- H2 viene segnalato solo per pagine di contenuto con almeno 300 parole visibili e zero H2;
- pagine privacy/cookie/termini/GDPR restano fuori dal perimetro SEO operativo.
