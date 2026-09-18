export const RECURRENCE_KIND = Object.freeze({
  NEW: "new",
  PERSISTENT: "persistent",
  RECURRENT: "recurrent",
  REGRESSION: "regression",
  FLAPPING: "flapping",
});

const ts = value => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export function classifyRecurrence({ incident = {}, history = [], observation = {} } = {}) {
  const fingerprint = String(observation.fingerprint || incident.fingerprint || "");
  const same = history
    .filter(row => String(row?.fingerprint || "") === fingerprint)
    .toSorted((a, b) => ts(a.at || a.lastSeenAt || a.resolvedAt) - ts(b.at || b.lastSeenAt || b.resolvedAt));

  if (!same.length) return { kind: RECURRENCE_KIND.NEW, fingerprint, autoFixAllowed: true, reason: "Prima osservazione del problema canonico." };

  const resolved = same.filter(row => row.state === "resolved" || row.verified === true);
  const open = same.filter(row => ["open", "detected", "needs_verification", "reappeared"].includes(row.state));
  const transitions = same.reduce((count, row, index) => {
    if (!index) return count;
    const beforeClosed = same[index - 1].state === "resolved" || same[index - 1].verified === true;
    const nowClosed = row.state === "resolved" || row.verified === true;
    return count + (beforeClosed !== nowClosed ? 1 : 0);
  }, 0);

  if (transitions >= 4) return { kind: RECURRENCE_KIND.FLAPPING, fingerprint, autoFixAllowed: false, reason: "Il problema alterna ripetutamente presenza e assenza: automazione sospesa per root-cause review." };

  const lastResolved = resolved.at(-1);
  if (lastResolved) {
    const changeAt = Math.max(ts(observation.changedAt), ts(observation.deployAt), ts(observation.correctionAt));
    if (changeAt && changeAt > ts(lastResolved.resolvedAt || lastResolved.at || lastResolved.lastSeenAt)) {
      return { kind: RECURRENCE_KIND.REGRESSION, fingerprint, autoFixAllowed: false, reason: "Il problema è tornato dopo una modifica successiva alla chiusura verificata." };
    }
    return { kind: RECURRENCE_KIND.RECURRENT, fingerprint, autoFixAllowed: true, reason: "Problema già chiuso con evidenza e rilevato nuovamente." };
  }

  if (open.length) return { kind: RECURRENCE_KIND.PERSISTENT, fingerprint, autoFixAllowed: true, reason: "Il problema era già aperto: aggiorna lo stesso lifecycle senza creare duplicati." };
  return { kind: RECURRENCE_KIND.NEW, fingerprint, autoFixAllowed: true, reason: "Nessun lifecycle precedente utilizzabile." };
}

export function canonicalLifecycleKey(clientId, fingerprint) {
  return `${String(clientId || "unknown")}::${String(fingerprint || "unknown")}`;
}
