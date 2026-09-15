// Public API for Rank & Growth.
//
// Legacy implementations remain in their current files while callers migrate
// incrementally. Consumers outside Rank should prefer this facade so ranking
// and opportunity logic can move without changing import contracts.
export { queryChanges, opportunityGroups } from "../../platform.js";
export { opportunityQueries } from "../../gscImport.js";
export { opportunityTask, findExistingTask } from "../../opportunityTasks.js";
