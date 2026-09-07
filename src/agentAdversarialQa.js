import {
  AgentMode,
  AgentStatus,
  SeoAgentOrchestrator,
  ToolRegistry,
} from "./agentRuntime.js";

const qaTool = (name, execute, extra = {}) => ({
  name,
  description: `QA ${name}`,
  inputSchema: {},
  outputSchema: {},
  source: "LOCAL_DATA",
  cost: "NONE",
  freshnessMs: 0,
  risk: "LOW",
  permission: "READ",
  mutatesData: false,
  timeoutMs: 500,
  idempotent: true,
  supportsAbort: true,
  execute,
  ...extra,
});

const customPlanner = (toolName) => ({
  plan: () => ({
    id: `qa-plan-${toolName}`,
    version: 1,
    workflow: "QA_ADVERSARIAL",
    parameters: {},
    steps: [{ id: `qa-step-${toolName}`, tool: toolName, input: {}, required: true, status: "PENDING" }],
  }),
  replan: () => { throw new Error("Il QA adversarial non deve eseguire replanning."); },
});

async function cancellationProbe() {
  let aborted = false;
  let runId = "";
  const registry = new ToolRegistry().register(qaTool(
    "qa.agent.slow",
    (_input, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true }), 300);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  ));
  const orchestrator = new SeoAgentOrchestrator({
    registry,
    planner: customPlanner("qa.agent.slow"),
    onUpdate: (run) => { if (!runId) runId = run.id; },
  });
  const pending = orchestrator.run("qa cancel", { projectId: 91001, mode: AgentMode.READ_ONLY });
  await new Promise((resolve) => setTimeout(resolve, 10));
  orchestrator.cancel(runId);
  const run = await pending;
  return {
    passed: aborted && run.status === AgentStatus.CANCELLED && orchestrator.active.size === 0,
    status: run.status,
    aborted,
    active: orchestrator.active.size,
  };
}

async function staleApprovalProbe() {
  let writes = 0;
  const registry = new ToolRegistry().register(qaTool(
    "qa.agent.high-risk-write",
    () => { writes += 1; return { ok: true }; },
    {
      permission: "WRITE",
      mutatesData: true,
      risk: "HIGH",
      category: "canonical",
      idempotent: false,
      preview: async () => ({ current: "qa-before", proposed: "qa-after" }),
    },
  ));
  const orchestrator = new SeoAgentOrchestrator({
    registry,
    planner: customPlanner("qa.agent.high-risk-write"),
  });
  const waiting = await orchestrator.run("qa approval", {
    projectId: 92001,
    mode: AgentMode.AUTONOMOUS,
  });
  let staleCode = "";
  try {
    await orchestrator.resolveApproval(
      waiting,
      { projectId: 92002 },
      { approved: true, token: waiting.pendingApproval?.token },
    );
  } catch (error) {
    staleCode = error?.code || "";
  }
  const rejected = await orchestrator.resolveApproval(
    waiting,
    { projectId: 92001 },
    { approved: false, token: waiting.pendingApproval?.token },
  );
  return {
    passed:
      waiting.status === AgentStatus.WAITING_APPROVAL &&
      staleCode === "APPROVAL_CONTEXT_MISMATCH" &&
      rejected.status === AgentStatus.BLOCKED &&
      writes === 0,
    waitingStatus: waiting.status,
    staleCode,
    rejectedStatus: rejected.status,
    writes,
  };
}

export async function checkAgentAdversarialRuntime() {
  const cancel = await cancellationProbe();
  const approval = await staleApprovalProbe();
  const passed = cancel.passed && approval.passed;
  return {
    status: passed ? "PASS" : "FAIL",
    area: "Agent adversarial runtime",
    detail: passed
      ? "Cancel abortisce realmente il tool e pulisce la run; approval stale/cross-project respinta; rifiuto corretto non esegue write."
      : `Cancel=${JSON.stringify(cancel)}; approval=${JSON.stringify(approval)}`,
  };
}
