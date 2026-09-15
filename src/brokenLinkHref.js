// Legacy compatibility shim.
// Links owns broken-link href parsing and transformation; existing consumers
// remain valid while imports migrate to the Links public API.
export {
  decodeLinkEntities,
  matchBrokenLinkHref,
  singleAnchorHref,
  transformBrokenLinkAnchors,
} from "./modules/links/brokenLinkHref.js";
