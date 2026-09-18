const DEFAULT_TIMEOUT_MS = 1800;
const pending = new Map();

const actionable = (target) => target?.closest?.("button,a,[role='button'],input[type='submit']");

export const shouldWatchAction = (element) => {
  if (!element || element.disabled || element.getAttribute?.("aria-disabled") === "true") return false;
  if (element.closest?.("[data-guardian-watch='off']")) return false;
  if (element.matches?.("a[href^='http'],a[target='_blank'],a[download]")) return false;
  if (element.matches?.("input[type='file']")) return false;
  if (element.getAttribute?.("type") === "button" && element.getAttribute?.("aria-haspopup")) return false;
  return true;
};

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
    if (!shouldWatchAction(element)) return;
    const key = actionKey(element);
    const declaredTimeout = Number(element.getAttribute?.("data-guardian-timeout"));
    const actionTimeout = Number.isFinite(declaredTimeout) && declaredTimeout >= timeoutMs ? Math.min(declaredTimeout, 15_000) : timeoutMs;
    const entry = { key, label: key.split(":").at(-1), timeoutMs: actionTimeout, observedEffect: false };
    pending.set(key, entry);
    window.setTimeout(() => {
      const current = pending.get(key);
      if (!current) return;
      pending.delete(key);
      if (!current.observedEffect) emitFailure(current);
    }, actionTimeout);
  };
  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("click", onClick, true);
    observer.disconnect();
    completionEvents.forEach((name) => window.removeEventListener(name, settleAll));
    pending.clear();
  };
}
