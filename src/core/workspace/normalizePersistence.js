import {
  WORKSPACE_STORE,
  guardWorkspaceTransaction,
  initializeWorkspace,
  openWorkspaceDb,
  readWorkspace,
  workspaceTransaction,
} from "../../workspaceDatabase.js";
import { canonicalizeWorkspaceEntries } from "./projectState.js";

const mapsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
};

export async function normalizeWorkspacePersistence() {
  const db = await openWorkspaceDb();
  try {
    const before = await readWorkspace(db);
    const after = canonicalizeWorkspaceEntries(before);
    if (mapsEqual(before, after)) return false;

    await workspaceTransaction(db, (tx) => guardWorkspaceTransaction(tx, () => {
      const store = tx.objectStore(WORKSPACE_STORE);
      for (const key of before.keys()) {
        if (!after.has(key)) store.delete(key);
      }
      for (const [key, value] of after) {
        if (key === "__generation") continue;
        if (before.get(key) !== value) store.put(value, key);
      }
    }), [WORKSPACE_STORE]);
  } finally {
    db.close();
  }

  // Refresh the in-memory mirror from the normalized IndexedDB snapshot before
  // React mounts. This makes reload/reopen observe the same canonical state.
  await initializeWorkspace();
  return true;
}
