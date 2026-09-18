import { useEffect } from "react";
import { guardianSnapshot, installGuardianRuntime } from "./guardian/guardianEngine.js";
import { guardianIncidentNotification } from "./automationNotifications.js";

const dispatchNotificationSnapshot = () => {
  const snapshot = guardianSnapshot();
  const incidents = [
    ...snapshot.open,
    ...snapshot.autoResolved.slice(-8),
  ];
  const notifications = incidents.map(guardianIncidentNotification).filter(Boolean);
  window.dispatchEvent(new CustomEvent("seogrow-automation-notifications", {
    detail: { notifications, guardian: snapshot },
  }));
};

export default function AutomationNotificationBridge() {
  useEffect(() => {
    const startGuardian = () => {
      installGuardianRuntime();
      dispatchNotificationSnapshot();
    };
    // Guardian writes to the canonical workspace ledger. Defer installation until
    // the initial restore/normalization turn is fully settled so it cannot race
    // the workspace restore lock used by browser/release QA.
    const startupId = window.setTimeout(startGuardian, 1500);
    const refresh = () => dispatchNotificationSnapshot();
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
