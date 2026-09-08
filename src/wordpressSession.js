// Passwords live only in this JavaScript module; never serialize this map.
const sessions = new Map();
const key = (clientId, url) => {
  try { const u = new URL(url); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return ''; return `${clientId}:${u.origin}${u.pathname.replace(/\/+$/, '')}`; } catch { return ''; }
};
export function rememberWordPressSession(clientId, connection) {
  const id = key(clientId, connection.url);
  if (!id || !connection.username || !connection.applicationPassword) return;
  sessions.set(id, { ...connection, verifiedAt: new Date().toISOString() });
}
export function getWordPressSession(clientId, url, now = Date.now()) {
  const id = key(clientId, url), value = sessions.get(id);
  if (!value || now - Date.parse(value.verifiedAt) >= 30 * 60_000 || now < Date.parse(value.verifiedAt)) { sessions.delete(id); return null; }
  return { ...value };
}
export function forgetWordPressSession(clientId, url) { sessions.delete(key(clientId, url)); }
