// WordPress application passwords are transient session state only.
// They must never be serialized into the persisted workspace.
const sessions = new Map();

const key = (clientId, url) => {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    return `${clientId}:${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
};

export function rememberWordPressSession(clientId, connection) {
  const id = key(clientId, connection.url);
  if (!id || !connection.username || !connection.applicationPassword) return;
  sessions.set(id, { ...connection, verifiedAt: new Date().toISOString() });
}

export function getWordPressSession(clientId, url, now = Date.now()) {
  const id = key(clientId, url);
  const value = sessions.get(id);
  const verifiedAt = Date.parse(value?.verifiedAt);
  if (!value || now - verifiedAt >= 30 * 60_000 || now < verifiedAt) {
    sessions.delete(id);
    return null;
  }
  return { ...value };
}

export function forgetWordPressSession(clientId, url) {
  sessions.delete(key(clientId, url));
}
