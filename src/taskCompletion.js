export function completeTaskById(tasks, taskId, reason, metadata = {}) {
  if (!taskId) return { tasks, changed: false };
  let changed = false;
  const next = tasks.map((task) => {
    if (task.id !== taskId || task.status === "Completato") return task;
    changed = true;
    return {
      ...task,
      status: "Completato",
      completedAt: metadata.completedAt || new Date().toISOString(),
      completionReason: reason || "Workflow completato in SeoGrow",
      workflowResult: metadata.result || task.workflowResult || "",
      workflowUrl: metadata.url || task.workflowUrl || "",
    };
  });
  return { tasks: changed ? next : tasks, changed };
}
