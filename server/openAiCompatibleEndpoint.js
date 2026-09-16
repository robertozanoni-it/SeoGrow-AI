const OPENAI_BASE = "https://api.openai.com/v1";

export function openAiCompatibleBaseUrl(env = process.env) {
  const raw = String(env.OPENAI_BASE_URL || "").trim();
  if (!raw) return OPENAI_BASE;

  let url;
  try { url = new URL(raw); }
  catch { throw new Error("OPENAI_BASE_URL non è un URL valido"); }

  if (url.protocol !== "https:") {
    throw new Error("OPENAI_BASE_URL deve usare HTTPS");
  }

  const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  if (normalized !== OPENAI_BASE) {
    throw new Error(`OPENAI_BASE_URL non è autorizzato: SeoGrow supporta solo ${OPENAI_BASE}`);
  }
  return OPENAI_BASE;
}

export function openAiCompatibleProvider(env = process.env) {
  openAiCompatibleBaseUrl(env);
  return "openai";
}

export function openAiCompatibleModel(model, env = process.env) {
  openAiCompatibleBaseUrl(env);
  return String(model || "").trim();
}

export function rewriteOpenAiApiUrl(input, env = process.env) {
  openAiCompatibleBaseUrl(env);
  return String(input || "");
}

export function rewriteOpenAiCompatibleRequestBody(body, env = process.env) {
  openAiCompatibleBaseUrl(env);
  return body;
}
