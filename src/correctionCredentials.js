// Credentials must come from an explicit client-scoped action, never from a
// password input belonging to an unrelated foreground project.
export function correctionCredentials(record, provided = {}) {
  const clientId = Number(provided.clientId);
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || clientId !== Number(record?.clientId)) {
    throw new Error("Seleziona il cliente della correzione e inserisci le sue credenziali WordPress.");
  }
  const siteKey = (value) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("URL WordPress non valido.");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  };
  if (!provided.siteUrl || !record.siteUrl || siteKey(provided.siteUrl) !== siteKey(record.siteUrl)) {
    throw new Error("Il sito della connessione non coincide con quello della correzione. Riconnetti il sito corretto.");
  }
  if (!provided.username || !provided.applicationPassword) {
    throw new Error("Inserisci utente e password applicativa del sito della correzione.");
  }
  return { siteUrl: provided.siteUrl, username: provided.username, applicationPassword: provided.applicationPassword };
}
