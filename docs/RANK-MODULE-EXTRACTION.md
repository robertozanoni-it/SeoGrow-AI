# Rank & Growth extraction

## Stato

Il modulo Rank & Growth espone il proprio public API da `src/modules/rank/index.js`.

La business logic per creare e riusare i task derivati dalle opportunità Search è ora posseduta da `src/modules/rank/opportunityTasks.js`.

`src/opportunityTasks.js` resta temporaneamente disponibile come compatibility shim per i consumer legacy già esistenti. Non deve contenere nuova business logic.

## Invarianti

- nessun cambio alle chiavi persistite;
- nessuna migrazione dati;
- nessun cambio alla semantica dei task esistenti;
- nessuna modifica alle route o alla UI;
- gli export legacy e quelli del facade Rank devono restare referenzialmente equivalenti durante la migrazione.

## Prossimo delta

Ridurre i consumer legacy residui del modulo Rank (`App.jsx`, `GuidedUxLayer.jsx`, `CardWorkspaceLayer.jsx`) e successivamente spostare `opportunityGroups`, `queryChanges`, `queryTaskDetail` e `opportunityQueries` dietro implementazioni possedute dal modulo, mantenendo shim compatibili finché necessario.
