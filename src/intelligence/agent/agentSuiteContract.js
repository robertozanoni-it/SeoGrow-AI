export const AGENT_STATE_ROLE = "analysis-log";

export const REAL_AGENT_TOOLS = Object.freeze([
  "data.gsc",
  "data.analysis",
  "data.rankings",
  "seo.opportunities",
  "seo.trafficDrop",
  "seo.contentDecay",
  "seo.internalLinks",
]);

const REAL_TOOL_SET = new Set(REAL_AGENT_TOOLS);
const text = (value) => String(value ?? "").trim();
const safeArray = (value) => Array.isArray(value) ? value : [];

export function validateRealAgentCapabilities(capabilities = []) {
  const errors = [];
  for (const capability of safeArray(capabilities)) {
    if (!REAL_TOOL_SET.has(capability?.name)) errors.push(`Capability non disponibile: ${capability?.name || "sconosciuta"}.`);
    if (capability?.mutatesData === true) errors.push(`Il tool ${capability.name} non può scrivere dati dalla superficie SEO Agent.`);
  }
  return {
    ok: errors.length === 0,
    errors,
    capabilities: safeArray(capabilities).filter((item) => REAL_TOOL_SET.has(item?.name) && item?.mutatesData !== true),
  };
}

const normalizeLogEntry = (entry = {}) => ({
  id: text(entry.id) || `agent-log-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  at: text(entry.at) || new Date().toISOString(),
  phase: ["analysis", "proposal", "action"].includes(entry.phase) ? entry.phase : "analysis",
  kind: text(entry.kind) || "EVENT",
  label: text(entry.label),
  targetType: ["task", "correction", "problem", ""].includes(entry.targetType) ? entry.targetType : "",
  targetId: text(entry.targetId),
  problemKey: text(entry.problemKey),
  sourceUrl: text(entry.sourceUrl),
});

export function asAgentAnalysisLog(run = {}) {
  const actionLog = safeArray(run.actionLog).map(normalizeLogEntry).slice(-100);
  return {
    ...run,
    stateRole: AGENT_STATE_ROLE,
    pendingApproval: null,
    approvalHistory: [],
    actionLog,
  };
}

export function appendAgentLog(run = {}, entry = {}) {
  const base = asAgentAnalysisLog(run);
  return {
    ...base,
    actionLog: [...base.actionLog, normalizeLogEntry(entry)].slice(-100),
  };
}

const correctionTime = (row) => Date.parse(row?.verifiedAt || row?.appliedAt || row?.updatedAt || row?.createdAt || "") || 0;

export function reconcileAgentLog(run = {}, { tasks = [], corrections = [] } = {}) {
  const taskMap = new Map(safeArray(tasks).map((task) => [text(task?.id), task]));
  const correctionRows = safeArray(corrections);
  return safeArray(run?.actionLog).map((entry) => {
    const normalized = normalizeLogEntry(entry);
    if (normalized.targetType === "task" && normalized.targetId) {
      const task = taskMap.get(normalized.targetId);
      return {
        ...normalized,
        canonical: task ? {
          exists: true,
          type: "task",
          id: task.id,
          status: text(task.status),
          title: text(task.title),
        } : { exists: false, type: "task", id: normalized.targetId, status: "non disponibile", title: "" },
      };
    }
    if (normalized.targetType === "correction") {
      const matched = correctionRows
        .filter((row) =>
          (normalized.targetId && text(row?.id) === normalized.targetId) ||
          (normalized.problemKey && text(row?.issueKey) === normalized.problemKey),
        )
        .toSorted((a, b) => correctionTime(b) - correctionTime(a))[0] || null;
      return {
        ...normalized,
        canonical: matched ? {
          exists: true,
          type: "correction",
          id: text(matched.id),
          status: text(matched.status),
          title: text(matched.issueLabel),
        } : { exists: false, type: "correction", id: normalized.targetId, status: "non ancora creata", title: "" },
      };
    }
    return { ...normalized, canonical: null };
  });
}

export function agentRunIsNonAuthoritative(run = {}) {
  return run?.stateRole === AGENT_STATE_ROLE && run?.pendingApproval == null;
}
