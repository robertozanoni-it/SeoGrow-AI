import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { normalizeClientId } from "./reliabilityModel.js";

const TASKS_KEY = "seogrow-tasks-v2";
const MIGRATION_KEY = "seogrow-task-client-id-integrity-v1";

export const repairTaskClientIds = (tasks) => {
  if (!Array.isArray(tasks)) return { tasks, changed: false };
  let changed = false;
  const next = tasks.map((task) => {
    if (!task || typeof task !== "object") return task;
    if (typeof task.sourceClientId !== "string") return task;
    const normalized = normalizeClientId(task.sourceClientId);
    if (!normalized) return task;
    changed = true;
    return { ...task, sourceClientId: normalized };
  });
  return { tasks: next, changed };
};

const migrate = () => {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === "1") return;
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_KEY, "1");
      return;
    }
    const parsed = JSON.parse(raw);
    const result = repairTaskClientIds(parsed);
    if (result.changed) localStorage.setItem(TASKS_KEY, JSON.stringify(result.tasks));
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch (error) {
    console.warn("Allineamento ID cliente dei task non completato:", error);
  }
};

if (typeof window !== "undefined") migrate();
