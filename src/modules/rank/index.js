// Public API for the Rank & Growth domain.
//
// Runtime implementation still lives behind the legacy application boundary;
// new consumers should enter the domain through this facade as extraction
// proceeds incrementally.
export { rankManifest } from "./manifest.js";
