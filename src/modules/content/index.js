// Public API for the Content domain.
//
// The facade is intentionally narrow while the legacy implementation is
// extracted incrementally. Add domain-owned exports here instead of creating
// new cross-domain imports into legacy files.
export { contentManifest } from "./manifest.js";
