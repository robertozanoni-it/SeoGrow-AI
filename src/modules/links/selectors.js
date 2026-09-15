const list = (value) => (Array.isArray(value) ? value : []);

// Read-only lenses over audit evidence already stored in the shared workspace.
// They intentionally return the original arrays: Links does not own, copy or
// mutate crawl/audit data during the modular-monolith extraction.
export const internalLinkSuggestions = (analysis) => list(analysis?.internalLinkSuggestions);
export const brokenInternalLinks = (analysis) => list(analysis?.brokenLinks);
export const brokenExternalLinks = (analysis) => list(analysis?.brokenExternalLinks);
export const orphanPages = (analysis) => list(analysis?.orphanPages);
