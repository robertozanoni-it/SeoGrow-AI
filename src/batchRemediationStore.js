import { openWorkspaceDb, WORKSPACE_STORE, workspaceTransaction, guardWorkspaceTransaction, assertWorkspaceWritable } from './workspaceDatabase.js';
const PREFIX = 'seogrow-batch-run-v1:';
const secret = /^(?:applicationPassword|password|authorization|apiKey|approvalToken|accessToken|refreshToken|credentials)$/i;
export function batchHistorySnapshot(run) {
  return JSON.parse(JSON.stringify(run, (key, value) => {
    if (secret.test(key) || key === 'inspected' || key === 'frontendContext') return undefined;
    return value;
  }));
}
export async function saveBatchRun(run) {
  assertWorkspaceWritable();
  const snapshot = batchHistorySnapshot({ ...run, revision: run.revision + 1, updatedAt: new Date().toISOString() });
  const db = await openWorkspaceDb();
  let conflict = false;
  try {
    await workspaceTransaction(db, tx => guardWorkspaceTransaction(tx, () => {
      const store = tx.objectStore(WORKSPACE_STORE), key = `${PREFIX}${run.clientId}:${run.id}`;
      const request = store.get(key);
      request.onsuccess = () => {
        let current;
        try { current = request.result ? JSON.parse(request.result) : null; }
        catch { tx.abort(); return; }
        if ((current?.revision || 0) !== run.revision) { conflict = true; tx.abort(); return; }
        store.put(JSON.stringify(snapshot), key);
      };
    }), [WORKSPACE_STORE]);
  } catch (cause) {
    throw Object.assign(new Error(conflict ? 'Run modificata in un’altra scheda: ricarica lo storico.' : 'Impossibile salvare il batch: nessuna nuova write autorizzata.', { cause }), { code: conflict ? 'BATCH_REVISION_CONFLICT' : 'BATCH_STORAGE_FAILED' });
  } finally { db.close(); }
  run.revision = snapshot.revision; run.updatedAt = snapshot.updatedAt;
  window.dispatchEvent(new CustomEvent('seogrow-batch-history', { detail: { clientId: run.clientId, id: run.id } }));
  return snapshot;
}
export async function listBatchRuns(clientId) {
  const db = await openWorkspaceDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(WORKSPACE_STORE, 'readonly'), store = tx.objectStore(WORKSPACE_STORE);
      const keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => {
        try {
          resolve(keys.result.flatMap((key, i) => String(key).startsWith(`${PREFIX}${Number(clientId)}:`) ? [JSON.parse(values.result[i])] : []).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
        } catch (error) { reject(error); }
      };
      tx.onabort = () => reject(tx.error || new Error('Storico batch non leggibile.'));
    });
  } finally { db.close(); }
}
export async function withBatchLock(siteUrl, action, locks = globalThis.navigator?.locks) {
  if (!locks?.request) throw new Error('Web Locks non disponibile: batch bloccato per evitare esecuzioni concorrenti.');
  const key = new URL(siteUrl).href.replace(/\/+$/, '');
  return locks.request(`seogrow-batch:${key}`, { ifAvailable: true }, async lock => {
    if (!lock) throw Object.assign(new Error('Un batch per questo sito è già attivo in un’altra scheda.'), { code: 'BATCH_ALREADY_RUNNING' });
    return action();
  });
}
