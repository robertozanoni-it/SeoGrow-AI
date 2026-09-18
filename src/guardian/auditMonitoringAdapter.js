const progressId = () => globalThis.crypto?.randomUUID?.() || `guardian-${Date.now()}`;

export async function runGuardianAuditMonitoring(detail = {}, {
  fetchImpl = globalThis.fetch,
  projectUrl = "",
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Audit runtime non disponibile.");
  const targeted = detail.mode !== "full-audit";
  const url = targeted ? detail.sourceUrl : projectUrl;
  if (!url) throw new Error(targeted ? "URL del problema non disponibile per il controllo mirato." : "URL progetto non disponibile per il full Audit.");
  const response = await fetchImpl("/api/site-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      maxPages: targeted ? 5 : 75,
      progressId: progressId(),
      monitoring: { fingerprint: detail.fingerprint || "", mode: detail.mode || "targeted-audit" },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Monitoraggio Audit non riuscito.");
  return data;
}

export function installGuardianAuditMonitoringAdapter({
  projectUrlForClient = () => "",
  onAnalysis = () => {},
} = {}) {
  if (typeof window === "undefined") return () => {};
  const listener = async (event) => {
    const detail = event?.detail || {};
    try {
      const analysis = await runGuardianAuditMonitoring(detail, {
        projectUrl: projectUrlForClient(detail.clientId),
      });
      await onAnalysis({ clientId: detail.clientId, analysis, monitoring: detail });
      detail.complete?.({ ok: true, analyzedAt: analysis.analyzedAt || analysis.startedAt || "", mode: detail.mode });
    } catch (error) {
      detail.fail?.(error);
    }
  };
  window.addEventListener("seogrow-monitoring-request", listener);
  return () => window.removeEventListener("seogrow-monitoring-request", listener);
}
