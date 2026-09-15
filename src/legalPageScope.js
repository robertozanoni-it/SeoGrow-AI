// Legacy compatibility shim.
// Audit owns the legal-page SEO scope policy; existing consumers remain valid
// while production imports migrate to the Audit data API.
export { isLegalPage, excludeLegalSeo } from "./modules/audit/legalPageScope.js";
