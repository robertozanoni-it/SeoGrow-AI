// Legacy compatibility shim.
// Tasks owns task deduplication behavior; existing consumers remain valid
// while production imports migrate to the Tasks public API.
export {
  sameTask,
  archiveDuplicateTasks,
} from "./experience/tasks/taskDuplicates.js";
