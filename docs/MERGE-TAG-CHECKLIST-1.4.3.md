# Merge e tagging checklist — 1.4.3

## Prima del merge della PR #177
- [ ] RC Live Gate completato con tutti i job verdi, incluso DataForSEO live.
- [ ] Release Gate finale completato con successo sulla stessa HEAD candidate.
- [ ] Connector Package completato con successo sulla stessa HEAD.
- [ ] Nessun P0/P1 aperto.
- [ ] Nessun nuovo file runtime/applicativo inatteso nella PR RC.
- [ ] `package.json` e `package-lock.json` coerenti con la versione da rilasciare.
- [ ] CHANGELOG, release notes, rollback e hotfix docs presenti.

## Merge
- [ ] Rimuovere lo stato draft solo quando tutti i gate sopra sono verdi.
- [ ] Verificare che la HEAD non sia cambiata dopo l’ultimo Gate.
- [ ] Merge della sola PR #177 in `main`; nessuna PR deferred post-1.4.3 deve entrare nel merge.

## Tag
- [ ] Creare il tag release solo sul commit risultante verificato in `main`.
- [ ] Il tag deve identificare la release 1.4.3 e non la branch RC.
- [ ] Non creare tag finale se DataForSEO live non è PASS.

## Dopo il merge/tag
- [ ] Verificare nuovamente Release Gate su `main` se il workflow viene attivato dal merge.
- [ ] Verificare artefatto Connector e checksum/integrità.
- [ ] Attivare la finestra di stabilizzazione descritta in `POST-RELEASE-1.4.3.md`.
- [ ] Tenere il cleanup post-release separato fino alla chiusura della stabilizzazione.

## Stop condition
Se qualunque Gate diventa rosso, compare un nuovo P0/P1 o cambia la HEAD candidate dopo la validazione, il merge/tagging torna NO-GO finché la nuova HEAD non viene riverificata integralmente.
