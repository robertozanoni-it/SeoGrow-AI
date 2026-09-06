const DB_NAME = "seogrow-remediation";
export const WORKSPACE_STORE = "workspace";
export const CORRECTIONS_STORE = "corrections";
const GENERATION = "__generation";
let cache = null;
let generation = null;
let frozen = false;
let pending = Promise.resolve();
let lastError = null;
let channel = null;

export function openWorkspaceDb(factory = window.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) return reject(new Error("IndexedDB non disponibile: workspace non aperto."));
    const request = factory.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CORRECTIONS_STORE)) {
        const store = db.createObjectStore(CORRECTIONS_STORE, { keyPath: "id" });
        store.createIndex("clientId", "clientId", { unique: false });
        store.createIndex("batchId", "batchId", { unique: false });
        store.createIndex("appliedAt", "appliedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) db.createObjectStore(WORKSPACE_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Chiudi le altre schede SeoGrow per aggiornare l'archivio."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export function workspaceTransaction(db, action, stores = [WORKSPACE_STORE, CORRECTIONS_STORE]) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    let failure;
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error("Transazione workspace interrotta."));
    tx.onerror = () => {}; // onabort is the terminal event
    try { action(tx); } catch (error) { failure = error; tx.abort(); }
  });
}

export async function readWorkspace(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, "readonly");
    const store = tx.objectStore(WORKSPACE_STORE);
    const values = store.getAll();
    const keys = store.getAllKeys();
    tx.oncomplete = () => resolve(new Map(keys.result.map((key, i) => [key, values.result[i]])));
    tx.onabort = () => reject(tx.error);
  });
}

export async function initializeWorkspace(nativeStorage = globalThis.localStorage) {
  const db = await openWorkspaceDb();
  try {
    // Read and initialize under a write transaction, so two first-open tabs
    // cannot overwrite one another's completed migration.
    await workspaceTransaction(db, tx => {
      const store = tx.objectStore(WORKSPACE_STORE);
      const request = store.get(GENERATION);
      request.onsuccess = () => {
        if (request.result) return;
        try {
          for (let i = 0; i < nativeStorage.length; i++) {
            const key = nativeStorage.key(i);
            if (key?.startsWith("seogrow-")) store.put(nativeStorage.getItem(key), key);
          }
          store.put(crypto.randomUUID(), GENERATION);
        } catch { tx.abort(); }
      };
    });
    cache = await readWorkspace(db);
    generation = cache.get(GENERATION);
    frozen = false;
    lastError = null;
    if (!channel && window.BroadcastChannel) {
      channel = new window.BroadcastChannel("seogrow-workspace-v2");
      channel.onmessage = ({ data }) => {
        if (!data || !cache) return;
        if (data.generation !== generation) { frozen = true; window.location.reload(); return; }
        if (typeof data.key !== "string") return;
        if (data.value === null) cache.delete(data.key); else cache.set(data.key, data.value);
        window.dispatchEvent(new StorageEvent("storage", { key: data.key, newValue: data.value }));
      };
    }
  } finally { db.close(); }
}

export function assertWorkspaceWritable() {
  if (frozen) throw new Error("Workspace in ripristino o cambiato in un'altra scheda: ricarica l'app.");
}

export function guardWorkspaceTransaction(tx, action) {
  assertWorkspaceWritable();
  const expectedGeneration = generation;
  const request = tx.objectStore(WORKSPACE_STORE).get(GENERATION);
  request.onsuccess = () => {
    if (expectedGeneration && request.result !== expectedGeneration) { frozen = true; tx.abort(); return; }
    try { action(); } catch { tx.abort(); }
  };
}

function queueWrite(key, value) {
  assertWorkspaceWritable();
  const before = cache.get(key);
  if ((before ?? null) === value) return;
  if (value === null) cache.delete(key); else cache.set(key, value);
  pending = pending.then(async () => {
    if (lastError) return;
    let db;
    try {
      db = await openWorkspaceDb();
      await workspaceTransaction(db, tx => guardWorkspaceTransaction(tx, () => {
        const store = tx.objectStore(WORKSPACE_STORE);
        if (value === null) store.delete(key); else store.put(value, key);
      }), [WORKSPACE_STORE]);
      channel?.postMessage({ generation, key, value });
    } catch (error) {
      if (before === undefined) cache.delete(key); else cache.set(key, before);
      lastError = error;
      frozen = true;
      window.dispatchEvent(new CustomEvent("seogrow-storage-error", { detail: { key, message: error.message } }));
    } finally { db?.close(); }
  });
}

export const workspaceStorage = {
  getItem(key) { return cache ? cache.get(key) ?? null : globalThis.localStorage.getItem(key); },
  setItem(key, value) { if (!cache) return globalThis.localStorage.setItem(key, value); queueWrite(key, String(value)); },
  removeItem(key) { if (!cache) return globalThis.localStorage.removeItem(key); queueWrite(key, null); },
};
export async function flushWorkspace() { await pending; if (lastError) throw lastError; }

// The only commit point of an import: all keys, all snapshots and generation
// change together. No UI is mounted with a partially imported workspace.
export async function commitWorkspaceRestore(db, entries, corrections, expectedGeneration, interrupt) {
  const nextGeneration = crypto.randomUUID();
  await workspaceTransaction(db, tx => {
    const store = tx.objectStore(WORKSPACE_STORE);
    const request = store.get(GENERATION);
    request.onsuccess = () => {
      if (expectedGeneration && request.result !== expectedGeneration) { tx.abort(); return; }
      try {
        store.clear();
        for (const [key, value] of entries) store.put(value, key);
        store.put(nextGeneration, GENERATION);
        const history = tx.objectStore(CORRECTIONS_STORE);
        history.clear();
        for (const record of corrections) history.put(record);
        if (interrupt) interrupt(tx);
      } catch { tx.abort(); }
    };
  });
  return nextGeneration;
}

export async function restoreWorkspace(entries, corrections) {
  await flushWorkspace();
  assertWorkspaceWritable();
  frozen = true;
  // Spent approval tokens are a local security ledger, not restorable history.
  entries.set("seogrow-agent-approval-ledger-v1", cache?.get("seogrow-agent-approval-ledger-v1") || "[]");
  const db = await openWorkspaceDb();
  try {
    const nextGeneration = await commitWorkspaceRestore(db, entries, corrections, generation);
    channel?.postMessage({ generation: nextGeneration });
    // Keep old components frozen until reload; they cannot save stale state.
    window.location.reload();
  } catch (error) { frozen = false; throw error; }
  finally { db.close(); }
}
