import { MANUAL_MASTER_QA_CHECKS, runMasterQa, summarizeMasterQa } from "./masterQaHarness.js";
import { runMasterQaV2AsyncChecks, runMasterQaV2Checks } from "./masterQaV2Checks.js";
import { checkAgentAdversarialRuntime } from "./agentAdversarialQa.js";
import { installQaPanel } from "./masterQaPanel.js";

export async function runMasterQaV2() {
  const base = await runMasterQa();
  const automaticBase = base.results.filter((item) => item.status !== "MANUAL");
  const extra = [
    ...runMasterQaV2Checks(),
    ...(await runMasterQaV2AsyncChecks()),
    await checkAgentAdversarialRuntime(),
  ];
  const manual = MANUAL_MASTER_QA_CHECKS.map((area) => ({
    status: "MANUAL",
    area,
    detail: "Richiede evidenza manuale/ambiente reale; il Master QA non simula un PASS.",
  }));
  const results = [...automaticBase, ...extra, ...manual];
  const report = {
    ...base,
    version: 3,
    results,
    summary: summarizeMasterQa(results),
  };
  window.__seogrowLastMasterQaReport = report;
  return report;
}

export function installMasterQaV2Panel() {
  installQaPanel({
    rootId: "seogrow-master-qa-v2",
    conflictingRootId: "seogrow-master-qa",
    launcherLabel: "Esegui collaudo generale v3",
    runningLabel: "Collaudo v3 in corso…",
    title: "Master QA v3",
    countKeys: ["PASS", "FAIL", "INFO", "MANUAL"],
    run: runMasterQaV2,
    width: 560,
    maxHeight: 76,
  });
}
