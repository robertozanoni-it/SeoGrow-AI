import { workspaceStorage } from "../../workspaceDatabase.js";
import { canonicalProblemClosures } from "./projectState.js";
import { WORKSPACE_KEYS } from "./storageKeys.js";

const permanentClosure = (item) => item?.permanent === true || item?.disposition === "do_not_modify" || item?.reason === "user-do-not-modify";

export function readWorkspaceJson(key, fallback, storage = workspaceStorage) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeWorkspaceJson(key, value, storage = workspaceStorage, { allowPermanentRemoval = false } = {}) {
  let nextValue = value;
  if (key === WORKSPACE_KEYS.problemClosures && Array.isArray(value)) {
    let existing = [];
    try { existing = JSON.parse(storage.getItem(key) || "[]"); } catch { existing = []; }
    const protectedClosures = allowPermanentRemoval ? [] : (Array.isArray(existing) ? existing.filter(permanentClosure) : []);
    nextValue = canonicalProblemClosures([...protectedClosures, ...value]);
  }
  const serialized = JSON.stringify(nextValue);
  storage.setItem(key, serialized);
  if (typeof window !== "undefined") {
    const detail = { key, newValue: serialized };
    const event = typeof StorageEvent === "function"
      ? new StorageEvent("storage", detail)
      : Object.assign(new Event("storage"), detail);
    window.dispatchEvent(event);
  }
  return nextValue;
}
