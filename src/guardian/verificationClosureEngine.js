export const VERIFICATION_STATE = Object.freeze({
  PENDING: "pending",
  VERIFIED: "verified",
  FAILED: "failed",
  INCONCLUSIVE: "inconclusive",
});

export function evaluatePostFixVerification({
  incident = {},
  correction = {},
  evidenceBefore = null,
  evidenceAfter = null,
  recheck = {},
} = {}) {
  if (!correction?.appliedAt && correction?.state !== "applied" && correction?.state !== "verified") {
    return { state: VERIFICATION_STATE.PENDING, canClose: false, reason: "Correzione non ancora applicata." };
  }
  if (recheck?.needsAudit === true || evidenceAfter == null) {
    return { state: VERIFICATION_STATE.INCONCLUSIVE, canClose: false, reason: "Serve una nuova evidenza post-fix." };
  }
  if (recheck?.ok === false || recheck?.problemPresent === true) {
    return { state: VERIFICATION_STATE.FAILED, canClose: false, reason: "La condizione problematica è ancora presente." };
  }
  const sameFingerprint = !recheck?.fingerprint || !incident?.fingerprint || recheck.fingerprint === incident.fingerprint;
  if (!sameFingerprint) {
    return { state: VERIFICATION_STATE.INCONCLUSIVE, canClose: false, reason: "La verifica non appartiene allo stesso problema canonico." };
  }
  if (recheck?.ok === true && recheck?.problemPresent === false) {
    return {
      state: VERIFICATION_STATE.VERIFIED,
      canClose: true,
      reason: "La stessa condizione è stata riverificata dopo la correzione e non è più presente.",
      verification: {
        at: recheck.at || new Date().toISOString(),
        source: recheck.source || "post-fix-recheck",
        evidenceBefore,
        evidenceAfter,
      },
    };
  }
  return { state: VERIFICATION_STATE.INCONCLUSIVE, canClose: false, reason: "Evidenza post-fix insufficiente per chiudere il problema." };
}

export function closureTransition({ problemState = "open", verification } = {}) {
  if (verification?.canClose === true && verification.state === VERIFICATION_STATE.VERIFIED) {
    return { from: problemState, to: "resolved", verified: true };
  }
  if (verification?.state === VERIFICATION_STATE.FAILED) {
    return { from: problemState, to: "reappeared", verified: false };
  }
  return { from: problemState, to: problemState === "resolved" ? "needs_verification" : problemState, verified: false };
}
