// Public API for Content.
//
// This is a compatibility facade over the existing planning implementation.
// It lets the Suite depend on the Content domain before files are physically
// moved out of their legacy locations.
export { contentPlan } from "../../platform.js";
export { calendarDays, planItems, scheduleItem, validDate } from "../../projectPlanning.js";
