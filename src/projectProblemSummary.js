import { buildUnifiedProblems } from "./problemsModel.js";
import { loadProjectWorkspaceState } from "./projectWorkspaceState.js";

export async function loadProjectProblemSummary({ clientId, analysisHistory = [], analysis = null, tasks = [] } = {}) {
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return { active: 0, high: 0, verify: 0, resolved: 0, verifiedCorrections: 0 };
  const state = await loadProjectWorkspaceState(clientId);
  const siteHistory = analysisHistory.length ? analysisHistory : analysis ? [analysis] : state.audits.site;
  const taskRows = tasks.length ? tasks : state.tasks;
  const model = buildUnifiedProblems({
    clientId,
    siteHistory,
    pageHistory: state.audits.page,
    tasks: taskRows,
    corrections: state.corrections,
    closures: state.problemClosures,
  });
  const open = (row) => !["resolved", "intentional"].includes(row.problemState);
  return {
    active: model.rows.filter(open).length,
    high: model.rows.filter((row) => row.severity === "high" && open(row)).length,
    verify: model.rows.filter((row) => row.problemState === "needs_verification").length,
    resolved: model.rows.filter((row) => row.problemState === "resolved").length,
    verifiedCorrections: state.corrections.filter((record) => String(record.status || "").toLowerCase() === "verificato").length,
  };
}
