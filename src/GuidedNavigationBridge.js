const nativeButtons = () =>
  typeof document === "undefined"
    ? []
    : [...document.querySelectorAll(".sidebar > nav:not(.guided-nav) button")];

const labelOf = (button) =>
  button?.querySelector?.("span")?.textContent?.trim() || button?.textContent?.trim() || "";

const mark = (key, value) => {
  if (typeof document === "undefined" || !document.body) return;
  document.body.dataset[key] = String(value ?? "");
};

export function bridgeGuidedNavigationClick(event) {
  const button = event?.target?.closest?.(".guided-nav button");
  if (!button || button.classList?.contains("guided-mode-toggle")) return false;
  const label = labelOf(button);
  if (!label) return false;
  const native = nativeButtons().find((candidate) => labelOf(candidate) === label && !candidate.disabled);
  mark("seogrowGuidedBridgeRequested", label);
  mark("seogrowGuidedBridgeNativeFound", Boolean(native));
  if (!native || native === button) return false;
  native.click();
  queueMicrotask(() => {
    mark("seogrowGuidedBridgeRenderedPage", document.querySelector(".app main")?.dataset?.page || "");
    mark("seogrowGuidedBridgeNativeActive", labelOf(nativeButtons().find((candidate) => candidate.classList.contains("active"))));
  });
  return true;
}

if (typeof document !== "undefined" && !globalThis.__seogrowGuidedNavigationBridgeInstalled) {
  globalThis.__seogrowGuidedNavigationBridgeInstalled = true;
  document.addEventListener("click", bridgeGuidedNavigationClick, true);
}
