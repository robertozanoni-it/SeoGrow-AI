export function mergeGoogleStatus(current, status) {
  const properties = Array.isArray(current.properties) ? current.properties : [];
  return { ...current, ...status, properties, configured: properties.length > 0 || status.configured === true, connected: properties.length > 0 || status.connected === true };
}
export function normalizeGoogleProperties(value) {
  if (!Array.isArray(value)) throw new Error("Elenco proprietà Google non valido");
  return [...new Map(value.filter(item => typeof item?.url === "string" && item.url.trim()).map(item => [item.url, item])).values()];
}
