// Public API for the Content domain.
//
// Implementations intentionally remain in legacy files while callers migrate
// incrementally. New consumers should depend on this facade instead of
// importing editorial planning logic directly from platform.js.
export { contentManifest } from "./manifest.js";
export { contentPlan } from "../../platform.js";
