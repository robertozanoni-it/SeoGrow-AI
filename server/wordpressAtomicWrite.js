import { isDeepStrictEqual } from "node:util";
import { pinnedHttpsFetch } from "./pinnedHttpsFetch.js";

export async function atomicWordPressWrite(base, headers, payload, transport = pinnedHttpsFetch) {
  const response = await transport(new URL("wp-json/seogrow/v1/atomic-write", base), {
    method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(20_000), body: JSON.stringify(payload),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw Object.assign(new Error("Redirect Connector rifiutato; esito della richiesta non verificabile."), { code: "ATOMIC_RESULT_UNVERIFIED", status: 409 });
  }
  const data = await response.json();
  if (!response.ok || data?.atomicGuaranteed !== true || data?.staleChecked !== true || data?.ok !== true) {
    // Only an explicit pre-write denial proves no mutation. A malformed 2xx,
    // redirect, timeout or proxy failure must retain the uncertain journal.
    const denied = response.status === 409 && ["ATOMIC_WRITE_UNAVAILABLE", "STALE_CONFLICT"].includes(data?.code);
    const missing = response.status === 404 && data?.code === "rest_no_route";
    throw Object.assign(new Error(data?.message || data?.error || "Connector senza garanzia atomica: esito non verificabile, nessun fallback REST."), {
      code: denied ? data.code : missing ? "ATOMIC_WRITE_UNAVAILABLE" : "ATOMIC_RESULT_UNVERIFIED", status: response.status === 403 ? 403 : 409,
    });
  }
  const matches = payload.resource === "taxonomy"
    ? data.singleField === true && data.term?.id === payload.id &&
      isDeepStrictEqual(data.before, payload.expectedCurrent?.[payload.field]) &&
      isDeepStrictEqual(data.after, payload.changes?.[payload.field])
    : data.entity?.id === payload.id && Object.entries(payload.changes || {}).every(([field, value]) =>
      field === "meta"
        ? Object.entries(value).every(([key, expected]) => isDeepStrictEqual(data.entity.meta?.[key], expected))
        : data.entity[field]?.raw === value);
  if (!matches) throw Object.assign(new Error("Risposta Connector incoerente con identità o valori richiesti; esito da verificare."), { code: "ATOMIC_RESULT_UNVERIFIED", status: 409 });
  return data;
}
