// Legacy compatibility shim for transient WordPress credentials.
// System owns the in-memory session implementation; existing consumers remain
// valid while the Suite migration proceeds.
export {
  rememberWordPressSession,
  getWordPressSession,
  forgetWordPressSession,
} from "./system/integrations/wordpressSession.js";
