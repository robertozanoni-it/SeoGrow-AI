// Legacy compatibility shim.
// Rank & Growth owns the opportunity-task business logic; existing imports keep
// working while production consumers migrate to the Suite module facade.
export {
  opportunityTask,
  findExistingTask,
} from "./modules/rank/opportunityTasks.js";
