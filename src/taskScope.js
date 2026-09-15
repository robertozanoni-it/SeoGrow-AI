// Legacy compatibility shim.
// Tasks owns legal-page task scoping; existing consumers remain valid while
// production imports migrate to the Tasks public API.
export {
  isLegalSeoTask,
  archiveLegalSeoTasks,
} from "./experience/tasks/taskScope.js";
