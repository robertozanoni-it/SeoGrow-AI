export const qaMatrix = [
  ["EXISTING-REGRESSION", "Opportunities, saved views, Google, navigation", "P0", "E2E Browser / Regression", "Isolated Browser QA, yoga query, no task", "Create repeatedly, save, reload, reopen; select views", "One stable task, Apri task, selected view and restored filters", "smoke"],
  ["TASK-001", "Task state and filters", "P0", "E2E Browser / Storage", "Active yoga task", "Da fare -> In corso with Da fare / In corso filters", "Same ID and fields, stored once, hidden only by filter", "smoke"],
  ["TASK-002", "Undo and reload", "P0", "E2E Browser / Regression", "TASK-001", "Undo then reload", "Da fare persisted, UI filters reset per current contract", "smoke"],
  ["TASK-005", "Multiple updates and terminal tasks", "P0", "E2E Browser", "Existing yoga task", "In corso -> Completato -> Undo -> reload", "Undo restores In corso; completed task excluded from active opportunity matching", "smoke"],
  ["CRUD-001", "Task CRUD", "P0", "E2E Browser / Storage", "Clean fixture", "Create, read, update, reload, delete, undo", "Stable ID and restored deleted task", "smoke"],
  ["FILTER-006", "Combined filters", "P1", "E2E Browser", "Two tasks", "Combine search and state", "AND matching; no task deleted", "smoke"],
  ["TASK-004", "Reload during update", "P0", "E2E Browser / Storage", "Persisted tasks", "Change state and reload immediately", "Old or new valid records only; no partial fields or duplicate IDs", "full"],
  ["ERROR-001", "Google property errors", "P1", "Error Injection / E2E Browser", "Configured mock Google", "400, 500, offline, timeout exception, invalid JSON, empty response", "Visible error, loading settles, tasks preserved, retry succeeds", "full"],
  ["STRESS-500", "500 tasks and project isolation", "P1", "E2E Browser / Performance", "Two existing tasks", "Seed 500, search, filter foreign project, reload", "502 stored IDs unique, foreign task excluded, filters respond", "release"],
  ["IDB-REAL-001", "Native IndexedDB abort", "P0", "Storage/Persistence / Error Injection", "Disposable native browser DB", "Write, abort replacement, reopen", "Original complete record survives", "release"],
  ["RESPONSIVE-001", "Task/modal layouts and keyboard", "P1", "Responsive / Visual / E2E Browser", "Populated Task UI", "1440,768,390; open modal; Escape", "No page overflow, modal contained, initial focus inside, Escape closes; PNG evidence", "smoke"],
];
export function requiredScenarios(mode) {
  const level = ["smoke", "full", "release"].indexOf(mode);
  return qaMatrix.filter(row => ["smoke", "full", "release"].indexOf(row[7]) <= level).map(row => row[0]);
}
