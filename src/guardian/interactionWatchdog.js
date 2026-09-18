const DEFAULT_TIMEOUT_MS = 1800;
const pending = new Map();

const actionable = (target) => target?.closest?.("button,a,[role='button'],input[type='submit']");

const actionKey = (element) => {
  const text = String(element?.getAttribute?.("aria-label") || element?.textContent || element?.name || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const page = globalThis.location?.hash || "";
  return `${page}:${text || element?.tagName || "action"}`;
};

const emitFailure = (entry) => {
  globalThis.dispatchEvent?.(new CustomEvent("seogrow-action-failed", {
    detail: {
      code: "UI_ACTION_NO_EFFECT",
      source: "interaction-watchdog",
      severity: "warning",
      message: `Azione senza effetto osservabile: ${entry.label}`,
      detail: `Nessun evento di completamento, navigazione o mutazione osservabile entro ${entry.timeoutMs} ms.`,
    },
  }));
};

export function installInteractionWatchdog({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const observer = new MutationObserver(() => {
    for (const entry of pending.values()) entry.observedEffect = true;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  const settleAll = () => {
    for (const entry of pending.values()) entry.observedEffect = true;
  };
  const completionEvents = ["hashchange", "popstate", "seogrow-locationchange", "seogrow-storage-ok", "seogrow-remediation-applied", "seogrow-task-cause-reconciled"];
  completionEvents.forEach((name) => window.addEventListener(name, settleAll));

  const onClick = (event) => {
    const element = actionable(event.target);
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return;
    if (element.matches("a[href^='http'],a[target='_blank']")) return;
    const key = actionKey(element);
    const entry = { key, label: key.split(":").at(-1), timeoutMs, observedEffect: false };
    pending.set(key, entry);
    window.setTimeout(() => {
      const current = pending.get(key);
      if (!current) return;
      pending.delete(key);
      if (!current.observedEffect) emitFailure(current);
    }, timeoutMs);
  };
  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("click", onClick, true);
    observer.disconnect();
    completionEvents.forEach((name) => window.removeEventListener(name, settleAll));
    pending.clear();
  };
}
