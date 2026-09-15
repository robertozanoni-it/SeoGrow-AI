import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const tasksManifest = defineSuiteModule({
  id: "tasks",
  label: "Tasks",
  layer: "experience",
  status: "active",
  homePage: "Task",
  futurePath: "/tasks",
  pages: ["Task"],
  capabilities: ["work-queue", "cross-module-actions"],
});
