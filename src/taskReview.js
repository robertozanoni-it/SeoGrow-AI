// Legacy compatibility shim.
// Tasks owns task review and canonical completion behavior; existing consumers
// remain valid while production imports migrate to the Tasks public API.
export {
  missingCanonicalTask,
  activeClientTasks,
  completeVerifiedCanonicals,
} from "./experience/tasks/taskReview.js";
