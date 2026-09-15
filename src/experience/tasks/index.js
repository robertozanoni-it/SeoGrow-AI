// Public API for the Tasks experience.
//
// Tasks owns shared task behavior. New consumers should use this boundary
// instead of importing legacy top-level task helpers directly.
export { tasksManifest } from "./manifest.js";
export {
  sameTask,
  archiveDuplicateTasks,
} from "./taskDuplicates.js";
export {
  isLegalSeoTask,
  archiveLegalSeoTasks,
} from "./taskScope.js";
export {
  missingCanonicalTask,
  activeClientTasks,
  completeVerifiedCanonicals,
} from "./taskReview.js";
export { normalizeStoredTasks } from "./taskPersistence.js";
export { tasksFromAnalysis } from "./auditTasks.js";
export { createTaskDraft } from "./taskFactory.js";
