// Legacy compatibility shim.
// Audit owns metadata duplicate grouping; existing imports remain valid while
// production consumers migrate to the Audit data API.
export { metadataDuplicateGroups } from "./modules/audit/metadataDuplicateGroups.js";
