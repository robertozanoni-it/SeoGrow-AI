import { useEffect, useRef } from "react";
import { guardianSnapshot, installGuardianRuntime } from "./guardian/guardianEngine.js";
import { guardianIncidentNotification } from "./automationNotifications.js";
import { nextGuardianProminentAlert } from "./guardian/guardianProminentAlert.js";

const dispatchNotificationSnapshot = (seenFingerprints) => {
  const snapshot = guardianSnapshot();
  const incidents = [
    ...snapshot.open,
    ...snapshot.autoResolved.slice(-8),
  ];
  const notifications = incidents.map(guardianIncidentNotification).filter(Boolean);
  window.dispatchEvent(new CustomEvent("seogrow-automation-notifications", {
    detail: { notifications, guardian: snapshot },
  }));
  const prominent = nextGuardianProminentAlert(snapshot, seenFingerprints);
  if (prominent) {
    window.dispatchEvent(new CustomEvent("seogrow-guardian-prominent-alert", {
      detail: prominent,
    }));
  }
};

export default function AutomationNotificationBridge() {
  const seenFingerprints = useRef(new Set());
  useEffect(() => {
    const startGuardian = () => {
      installGuardianRuntime();
      dispatchNotificationSnapshot(seenFingerprints.current);
    };
    // Guardian writes to the canonical workspace ledger. Defer installation until
    // the initial restore/normalization turn is fully settled so it cannot race
    // the workspace restore lock used by browser/release QA.
    const startupId = window.setTimeout(startGuardian, 1500);
    const refresh = () => dispatchNotificationSnapshot(seenFingerprints.current);
    window.addEventListener("seogrow-guardian-updated", refresh);
    window.addEventListener("seogrow-automation-orchestrator-updated", refresh);
    return () => {
      window.clearTimeout(startupId);
      window.removeEventListener("seogrow-guardian-updated", refresh);
      window.removeEventListener("seogrow-automation-orchestrator-updated", refresh);
    };
  }, []);
  return null;
}
