const TRUSTED_AI_BASES = new Map([
  ["api.openai.com", "https://api.openai.com/v1"],
  ["openrouter.ai", "https://openrouter.ai/api/v1"],
]);

export function openAiCompatibleBaseUrl(env = process.env) {
  const raw = String(env.OPENAI_BASE_URL || "").trim();
  if (!raw) return "https://api.openai.com/v1";
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("OPENAI_BASE_URL non è un URL valido"); }
  if (url.protocol !== "https:") throw new Error("OPENAI_BASE_URL deve usare HTTPS");
  const trusted = TRUSTED_AI_BASES.get(url.hostname.toLowerCase());
  if (!trusted) throw new Error("OPENAI_BASE_URL non è autorizzato: usa api.openai.com oppure openrouter.ai");
  const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  const expected = trusted.replace(/\/+$/, "");
  if (normalized !== expected) throw new Error(`OPENAI_BASE_URL deve essere esattamente ${trusted}`);
  return expected;
}

export function openAiCompatibleProvider(env = process.env) {
  return openAiCompatibleBaseUrl(env).includes("openrouter.ai") ? "openrouter" : "openai";
}

export function rewriteOpenAiApiUrl(input, env = process.env) {
  const original = String(input || "");
  let url;
  try { url = new URL(original); }
  catch { return original; }
  if (url.origin !== "https://api.openai.com" || !url.pathname.startsWith("/v1/")) return original;
  const base = openAiCompatibleBaseUrl(env);
  const suffix = `${url.pathname.slice(3)}${url.search}`;
  return `${base}${suffix}`;
}
