const SEVERITY_WEIGHT = Object.freeze({ critical: 4, error: 3, warning: 2, info: 1 });

const validOpen = (snapshot) => (Array.isArray(snapshot?.open) ? snapshot.open : [])
  .filter((incident) => incident?.fingerprint && incident?.state !== "resolved");

export function nextGuardianProminentAlert(snapshot, seenFingerprints = new Set()) {
  const open = validOpen(snapshot);
  const current = new Set(open.map((incident) => incident.fingerprint));

  for (const fingerprint of [...seenFingerprints]) {
    if (!current.has(fingerprint)) seenFingerprints.delete(fingerprint);
  }

  const fresh = open.filter((incident) => !seenFingerprints.has(incident.fingerprint));
  if (!fresh.length) return null;
  for (const incident of fresh) seenFingerprints.add(incident.fingerprint);

  const ordered = fresh.toSorted((left, right) =>
    (SEVERITY_WEIGHT[right?.severity] || 0) - (SEVERITY_WEIGHT[left?.severity] || 0) ||
    Date.parse(right?.lastSeenAt || 0) - Date.parse(left?.lastSeenAt || 0),
  );
  const primary = ordered[0];
  const count = ordered.length;
  const noun = count === 1 ? "anomalia" : "anomalie";
  const extra = count > 1 ? ` · +${count - 1} ${count - 1 === 1 ? "altra" : "altre"}` : "";

  return {
    count,
    kind: ["critical", "error"].includes(primary?.severity) ? "error" : "warning",
    title: `Guardian ha rilevato ${count} ${noun}`,
    message: `${primary?.message || "È richiesta una verifica."}${extra}`,
    page: "Problemi",
    fingerprint: primary?.fingerprint || "",
    clientId: primary?.clientId || 0,
    fingerprints: ordered.map((incident) => incident.fingerprint),
  };
}
