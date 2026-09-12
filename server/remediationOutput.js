// Share the final-output contract across Responses and compatible chat gateways.
export const outputError = (code, message) => Object.assign(new Error(message), { code });
export function assertCompletedModelResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw outputError("AI_INVALID_RESPONSE", "Il provider AI ha restituito una risposta non valida.");
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const output = Array.isArray(data.output) ? data.output : [];
  const refused = data.refusal || choices.some(c => c?.message?.refusal || c?.finish_reason === "content_filter") ||
    output.some(item => item?.type === "refusal" || item?.content?.some?.(part => part?.type === "refusal"));
  if (refused) throw outputError("AI_REFUSAL", "Il provider AI ha rifiutato la generazione. Nessuna proposta applicabile.");
  if (data.error) throw outputError("AI_PROVIDER_ERROR", "Il provider AI ha segnalato un errore nella generazione.");
  if (data.incomplete_details || (data.status && data.status !== "completed") || output.some(item => item?.status && item.status !== "completed") ||
      choices.some(c => c?.finish_reason && c.finish_reason !== "stop")) throw outputError("AI_OUTPUT_INCOMPLETE", "Il provider AI non ha completato integralmente la generazione: la risposta interrotta non viene applicata.");
  if (choices.length > 1) throw outputError("AI_OUTPUT_AMBIGUOUS", "Il provider AI ha restituito più risposte: serve una singola proposta.");
}
const textParts = content => typeof content === "string" ? content : Array.isArray(content)
  ? content.filter(part => typeof part === "string" || ["text", "output_text"].includes(part?.type))
    .map(part => typeof part === "string" ? part : typeof part.text === "string" ? part.text : "").join("") : "";
export function collectFinalModelText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output : [];
  const text = output.filter(item => (!item?.type || item.type === "message") && (!item?.role || item.role === "assistant"))
    .map(item => textParts(item.content)).join("").trim();
  if (text) return text;
  const choice = Array.isArray(data?.choices) && data.choices.length === 1 ? data.choices[0] : null;
  return textParts(choice?.message?.content || choice?.text).trim();
}
export function parseModelValue(text, { allowPlainText = false } = {}) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) throw outputError("AI_OUTPUT_FORMAT", "Il provider AI non ha restituito il valore richiesto.");
  // One entire fence is allowed, never a JSON fragment scraped out of prose.
  const fenced = source.match(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?```$/i);
  const candidate = (fenced ? fenced[1] : source).trim();
  let parsed;
  try { parsed = JSON.parse(candidate); } catch { /* Validate below. */ }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 1 && typeof parsed.value === "string" && parsed.value.trim()) return parsed.value.trim();
  if (allowPlainText && typeof parsed === "string" && parsed.trim()) return parsed.trim();
  if (allowPlainText && parsed === undefined && !/[{}[\]`<>]/.test(candidate) && !/^[\d"']/.test(candidate)) return candidate;
  throw outputError("AI_OUTPUT_FORMAT", "Il provider AI non ha restituito JSON valido nello schema richiesto {\"value\":\"testo\"}.");
}
export function canRetryGeneration(error) {
  if (["AI_REFUSAL", "AI_OUTPUT_AMBIGUOUS", "AI_PROVIDER_ERROR"].includes(error?.code)) return false;
  if ([401, 403, 429].includes(Number(error?.status))) return false;
  return !/budget|quota|credenzial|api.?key|non .?configurat|unauthorized|forbidden|rate.limit/i.test(String(error?.message || ""));
}
