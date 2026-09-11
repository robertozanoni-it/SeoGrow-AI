const REPLAY_MARK = "__seogrowMountReplay";

const isAutomaticProposalActive = () =>
  typeof document !== "undefined" && document.body?.dataset?.seogrowAutomaticProposal === "true";

const remediationReady = () =>
  Boolean(
    document.querySelector(".proposal-remediation-slot .remediation-host") &&
    document.querySelector(".proposal-remediation-slot .wp-live-remediation-v2"),
  );

const replayWhenMounted = (detail) => {
  let frame = 0;
  let attempts = 0;
  const readFocus = () => {
    try { return window.sessionStorage.getItem("seogrow-problem-proposal-v1"); } catch { return null; }
  };
  const focusAtStart = readFocus();
  const check = () => {
    if (!isAutomaticProposalActive() || readFocus() !== focusAtStart) return;
    if (remediationReady()) {
      window.dispatchEvent(new CustomEvent("seogrow-remediation-open", {
        detail: { ...detail, [REPLAY_MARK]: true },
      }));
      return;
    }
    attempts += 1;
    if (attempts < 180) frame = window.requestAnimationFrame(check);
  };
  frame = window.requestAnimationFrame(check);
  return () => window.cancelAnimationFrame(frame);
};

let cancelPending = null;
const cancelReplay = () => { cancelPending?.(); cancelPending = null; };
const onRemediationFocus = (event) => {
  const detail = event?.detail;
  if (!detail || detail[REPLAY_MARK] || !isAutomaticProposalActive()) return;
  cancelReplay();
  cancelPending = replayWhenMounted(detail);
};

if (typeof window !== "undefined" && !window.__seogrowRemediationFocusReplayInstalled) {
  window.__seogrowRemediationFocusReplayInstalled = true;
  window.addEventListener("seogrow-remediation-open", onRemediationFocus);
  for (const event of ["hashchange", "seogrow-locationchange", "seogrow-automatic-proposal-open", "seogrow-automatic-proposal-close"]) {
    window.addEventListener(event, cancelReplay);
  }
}

export { remediationReady, replayWhenMounted };
