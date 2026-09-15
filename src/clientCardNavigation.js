// Legacy compatibility shim.
// Hub owns client-card project selection and navigation behavior; existing
// consumers remain valid while imports migrate to the Hub public API.
export { clientForCard, selectCardClient } from "./experience/hub/clientCardNavigation.js";
