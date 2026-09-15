import { workspaceStorage } from "../../workspaceDatabase.js";

export function readWorkspaceJson(key, fallback, storage = workspaceStorage) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeWorkspaceJson(key, value, storage = workspaceStorage) {
  const serialized = JSON.stringify(value);
  storage.setItem(key, serialized);
  if (typeof window !== "undefined") {
    const detail = { key, newValue: serialized };
    const event = typeof StorageEvent === "function"
      ? new StorageEvent("storage", detail)
      : Object.assign(new Event("storage"), detail);
    window.dispatchEvent(event);
  }
  return value;
}
