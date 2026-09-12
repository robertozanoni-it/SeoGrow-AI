const nativeButtons = () =>
  typeof document === "undefined"
    ? []
    : [...document.querySelectorAll(".sidebar > nav:not(.guided-nav) button")];

const labelOf = (button) =>
  button?.querySelector?.("span")?.textContent?.trim() || button?.textContent?.trim() || "";

export function bridgeGuidedNavigationClick(event) {
  const button = event?.target?.closest?.(".guided-nav button");
  if (!button || button.classList?.contains("guided-mode-toggle")) return false;
  const label = labelOf(button);
  if (!label) return false;
  const native = nativeButtons().find((candidate) => labelOf(candidate) === label && !candidate.disabled);
  if (!native || native === button) return false;
  native.click();
  return true;
}

if (typeof document !== "undefined" && !globalThis.__seogrowGuidedNavigationBridgeInstalled) {
  globalThis.__seogrowGuidedNavigationBridgeInstalled = true;
  document.addEventListener("click", bridgeGuidedNavigationClick, true);
}
